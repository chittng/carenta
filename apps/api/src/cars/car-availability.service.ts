import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  type AvailabilityBlock,
  type AvailabilityBlockInput,
  type CarAvailability,
  ErrorCode,
} from '@carenta/shared';

import { AppException } from '../common/errors/app.exception.js';
import { Prisma, type CarStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  calendarBusyRanges,
  freeForTripSql,
  HOLDING_BOOKING_STATUSES,
  noHoldingBookingOverlapSql,
  type TimeRange,
  vietnamMonthRange,
} from './availability.js';
import { listedCarWhere } from './public-cars.policy.js';

const blockSelect = { id: true, startAt: true, endAt: true, reason: true } as const;
type BlockRow = Prisma.AvailabilityBlockGetPayload<{ select: typeof blockSelect }>;
type Tx = Prisma.TransactionClient;

const notFound = () =>
  new AppException(
    HttpStatus.NOT_FOUND,
    ErrorCode.NOT_FOUND,
    'Không tìm thấy xe hoặc khoảng chặn lịch.',
  );

const toBlock = (row: BlockRow): AvailabilityBlock => ({
  id: row.id,
  startAt: row.startAt.toISOString(),
  endAt: row.endAt.toISOString(),
  reason: row.reason,
});

const blockData = (input: AvailabilityBlockInput) => ({
  startAt: new Date(input.startAt),
  endAt: new Date(input.endAt),
  reason: input.reason || null,
});

/** Owner blocks and anonymous monthly calendars (spec §4.3, decided 2026-11-14). */
@Injectable()
export class CarAvailabilityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listBlocks(ownerId: string, carId: string, month: string): Promise<AvailabilityBlock[]> {
    await this.assertOwnedCar(ownerId, carId);
    const window = vietnamMonthRange(month);
    const rows = await this.prisma.availabilityBlock.findMany({
      where: { carId, startAt: { lt: window.endAt }, endAt: { gt: window.startAt } },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      select: blockSelect,
    });
    // Keep the original endpoints so an owner can edit a block spanning several months.
    return rows.map(toBlock);
  }

  createBlock(
    ownerId: string,
    carId: string,
    input: AvailabilityBlockInput,
  ): Promise<AvailabilityBlock> {
    return this.prisma.$transaction(async (tx) => {
      await lockEditableCar(tx, ownerId, carId);
      const data = blockData(input);
      await assertNoBooking(tx, carId, data);
      return toBlock(
        await tx.availabilityBlock.create({ data: { carId, ...data }, select: blockSelect }),
      );
    });
  }

  replaceBlock(
    ownerId: string,
    carId: string,
    blockId: string,
    input: AvailabilityBlockInput,
  ): Promise<AvailabilityBlock> {
    return this.prisma.$transaction(async (tx) => {
      await lockEditableCar(tx, ownerId, carId);
      const block = await tx.availabilityBlock.findFirst({
        where: { id: blockId, carId },
        select: { id: true },
      });
      if (!block) throw notFound();
      const data = blockData(input);
      await assertNoBooking(tx, carId, data);
      return toBlock(
        await tx.availabilityBlock.update({ where: { id: block.id }, data, select: blockSelect }),
      );
    });
  }

  async removeBlock(ownerId: string, carId: string, blockId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockEditableCar(tx, ownerId, carId);
      const result = await tx.availabilityBlock.deleteMany({ where: { id: blockId, carId } });
      if (result.count === 0) throw notFound();
    });
  }

  async ownerCalendar(ownerId: string, carId: string, month: string): Promise<CarAvailability> {
    await this.assertOwnedCar(ownerId, carId);
    return this.calendar(carId, month);
  }

  async publicCalendar(carId: string, month: string, now = new Date()): Promise<CarAvailability> {
    const car = await this.prisma.car.findFirst({
      where: { id: carId, ...listedCarWhere(now) },
      select: { id: true },
    });
    if (!car) throw notFound();
    return this.calendar(carId, month);
  }

  /**
   * Booking creation/acceptance must use this within the SAME transaction as the write.
   * The car lock serializes with owner blocks; the exclusion constraint still protects
   * against competing bookings. blockedUntil comes from the booking's buffer snapshot.
   * Calendar availability alone does not check listing status, eligibility or pricing.
   */
  async isRangeFree(
    tx: Tx,
    carId: string,
    range: TimeRange & { blockedUntil: Date },
    excludeBookingId?: string,
  ): Promise<boolean> {
    if (!(range.endAt > range.startAt) || !(range.blockedUntil >= range.endAt)) {
      throw new RangeError('Invalid trip availability range');
    }
    const cars = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM cars WHERE id = ${carId}::uuid FOR UPDATE`;
    if (cars.length === 0) return false;
    const [row] = await tx.$queryRaw<{ free: boolean }[]>`
      SELECT ${freeForTripSql(
        Prisma.sql`${carId}::uuid`,
        Prisma.sql`${range.startAt.toISOString()}::timestamptz`,
        Prisma.sql`${range.endAt.toISOString()}::timestamptz`,
        Prisma.sql`${range.blockedUntil.toISOString()}::timestamptz`,
        excludeBookingId,
      )} AS free`;
    return row?.free ?? false;
  }

  private async assertOwnedCar(ownerId: string, carId: string): Promise<void> {
    const car = await this.prisma.car.findFirst({
      where: { id: carId, ownerId },
      select: { id: true },
    });
    if (!car) throw notFound();
  }

  private async calendar(carId: string, month: string): Promise<CarAvailability> {
    const window = vietnamMonthRange(month);
    // A single statement sees both sources in one Postgres snapshot.
    const ranges = await this.prisma.$queryRaw<{ start_at: Date; end_at: Date }[]>`
      SELECT start_at, end_at FROM availability_blocks
      WHERE car_id = ${carId}::uuid
        AND start_at < ${window.endAt.toISOString()}::timestamptz
        AND end_at > ${window.startAt.toISOString()}::timestamptz
      UNION ALL
      SELECT start_at, blocked_until AS end_at FROM bookings
      WHERE car_id = ${carId}::uuid
        AND status::text IN (${Prisma.join([...HOLDING_BOOKING_STATUSES])})
        AND start_at < ${window.endAt.toISOString()}::timestamptz
        AND blocked_until > ${window.startAt.toISOString()}::timestamptz`;
    return {
      month,
      busy: calendarBusyRanges(
        ranges.map((row) => ({ startAt: row.start_at, endAt: row.end_at })),
        window,
      ),
    };
  }
}

/** Every calendar writer (including future booking transitions) takes this car-row lock. */
async function lockEditableCar(tx: Tx, ownerId: string, carId: string): Promise<void> {
  const [car] = await tx.$queryRaw<{ status: CarStatus }[]>`
    SELECT status::text AS status FROM cars
    WHERE id = ${carId}::uuid AND owner_id = ${ownerId}::uuid FOR UPDATE`;
  if (!car) throw notFound();
  if (car.status === 'REMOVED') {
    throw new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.CAR_STATUS_CONFLICT,
      'Xe đã bị gỡ khỏi Carenta nên không thể chỉnh sửa.',
    );
  }
}

async function assertNoBooking(tx: Tx, carId: string, range: TimeRange): Promise<void> {
  const [row] = await tx.$queryRaw<{ free: boolean }[]>`
    SELECT ${noHoldingBookingOverlapSql(
      Prisma.sql`${carId}::uuid`,
      Prisma.sql`${range.startAt.toISOString()}::timestamptz`,
      Prisma.sql`${range.endAt.toISOString()}::timestamptz`,
    )} AS free`;
  if (!row?.free) {
    throw new AppException(
      HttpStatus.CONFLICT,
      ErrorCode.AVAILABILITY_BOOKING_CONFLICT,
      'Khoảng thời gian này đã có đơn thuê, kể cả thời gian đệm. Vui lòng chọn khoảng khác.',
    );
  }
}
