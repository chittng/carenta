import { createHash } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  approvalDeadline,
  type Booking,
  type BookingListQuery,
  type BookingPage,
  chargedKm,
  checkoutDeadline,
  type CreateBookingInput,
  ErrorCode,
  paymentDeadline,
  rentalEligibilityIssues,
  tripWindowIssue,
  vietnamDate,
} from '@carenta/shared';

import { CarAvailabilityService } from '../cars/car-availability.service.js';
import { modelWithMake, toDeliveryView, toPricingView } from '../cars/cars.mapper.js';
import { listedCarWhere } from '../cars/public-cars.policy.js';
import { rentalQuote } from '../cars/rental-quote.js';
import { toDateOnly } from '../common/dates.js';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../storage/uploads.service.js';
import { BookingExpiryService } from './booking-expiry.service.js';
import { BookingJobOutboxService } from './booking-job-outbox.service.js';
import { BOOKING_JOBS, writeBookingJob } from './booking-jobs.js';
import {
  BOOKING_VIEW_INCLUDE,
  bookingSnapshotSchema,
  type BookingSnapshot,
  toBooking,
} from './booking-snapshot.js';
import { BookingStateMachine } from './booking-state-machine.js';

type Tx = Prisma.TransactionClient;
const CAR_INCLUDE = {
  pricing: true,
  model: modelWithMake,
  photos: { orderBy: { position: 'asc' }, take: 1, select: { fileKey: true } },
} as const satisfies Prisma.CarInclude;
type RentalCar = Prisma.CarGetPayload<{ include: typeof CAR_INCLUDE }>;
const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Không tìm thấy đơn thuê.');
const statusConflict = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.BOOKING_STATUS_CONFLICT,
    'Đơn thuê không ở trạng thái cho phép thực hiện thao tác này.',
  );
const unavailable = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.CAR_UNAVAILABLE,
    'Xe không còn trống trong khoảng thời gian đã chọn.',
  );
const expired = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.BOOKING_EXPIRED,
    'Đơn thuê đã hết hạn. Vui lòng đặt lại.',
  );
const TX_OPTIONS = { timeout: 15_000, maxWait: 10_000 };

@Injectable()
export class BookingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BookingStateMachine) private readonly state: BookingStateMachine,
    @Inject(CarAvailabilityService) private readonly availability: CarAvailabilityService,
    @Inject(BookingExpiryService) private readonly expiry: BookingExpiryService,
    @Inject(BookingJobOutboxService) private readonly outbox: BookingJobOutboxService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}

  async create(renterId: string, input: CreateBookingInput, requestedAt?: Date): Promise<Booking> {
    const fingerprint = requestFingerprint(input);
    let bookingId: string;
    try {
      bookingId = await this.prisma.$transaction(async (tx) => {
        // This key is renter-scoped even when a retry changes carId. Unique constraint is
        // the backstop; unrelated keys can still proceed concurrently.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${renterId}.${input.requestId}`}))`;
        const previous = await tx.booking.findUnique({
          where: { renterId_requestId: { renterId, requestId: input.requestId } },
        });
        if (previous) {
          if (previous.requestFingerprint !== fingerprint)
            throw new AppException(
              HttpStatus.CONFLICT,
              ErrorCode.BOOKING_REQUEST_CONFLICT,
              'Mã yêu cầu này đã được dùng cho nội dung đặt xe khác. Vui lòng tạo yêu cầu mới.',
            );
          await this.state.expire(tx, previous.id, requestedAt);
          return previous.id;
        }
        const startAt = new Date(input.startAt);
        const endAt = new Date(input.endAt);
        assertTripWindow(startAt, endAt, requestedAt ?? new Date());
        const reference = await tx.car.findUnique({
          where: { id: input.carId },
          select: { ownerId: true },
        });
        if (!reference)
          throw new AppException(
            HttpStatus.NOT_FOUND,
            ErrorCode.NOT_FOUND,
            'Không tìm thấy xe đang hiển thị.',
          );
        if (reference.ownerId === renterId)
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            ErrorCode.BOOKING_SELF_RENTAL,
            'Bạn không thể thuê xe của chính mình.',
          );
        await lockParticipants(tx, renterId, reference.ownerId);
        await tx.$queryRaw`SELECT id FROM cars WHERE id = ${input.carId}::uuid FOR UPDATE`;
        const now = requestedAt ?? new Date();
        assertTripWindow(startAt, endAt, now);
        const car = await getRentalCar(tx, input.carId, now);
        await assertEligibility(tx, renterId, car, startAt, endAt);
        await this.expiry.expireForCar(tx, car.id, now);
        const blockedUntil = new Date(endAt.getTime() + car.bufferMinutes * 60_000);
        if (!(await this.availability.isRangeFree(tx, car.id, { startAt, endAt, blockedUntil })))
          throw unavailable();
        const priced = await rentalQuote(tx, car, input);
        const setting = await tx.platformSetting.findUnique({
          where: { key: 'commission_rate_percent' },
        });
        const rate = setting?.value ?? 15;
        if (typeof rate !== 'number' || !Number.isInteger(rate) || rate < 0 || rate > 100) {
          throw new AppException(
            HttpStatus.SERVICE_UNAVAILABLE,
            ErrorCode.SERVICE_UNAVAILABLE,
            'Cấu hình hoa hồng chưa hợp lệ. Vui lòng thử lại sau.',
          );
        }
        const snapshot = makeSnapshot(car, priced.holidays);
        const booking = await this.state.create(
          tx,
          {
            carId: car.id,
            ownerId: car.ownerId,
            renterId,
            requestId: input.requestId,
            requestFingerprint: fingerprint,
            startAt,
            endAt,
            blockedUntil,
            pickupMethod: input.pickupMethod,
            deliveryAddress: input.pickupMethod === 'DELIVERY' ? input.deliveryAddress : null,
            deliveryLatitude:
              input.pickupMethod === 'DELIVERY' ? input.deliveryLocation?.latitude : null,
            deliveryLongitude:
              input.pickupMethod === 'DELIVERY' ? input.deliveryLocation?.longitude : null,
            deliveryDistanceKm:
              priced.deliveryDistanceKm === null ? null : chargedKm(priced.deliveryDistanceKm),
            pricingSnapshot: snapshot,
            priceBreakdown: priced.quote,
            rentalAmount: priced.quote.rentalAmount,
            deliveryFee: priced.quote.deliveryFee,
            depositAmount: priced.quote.depositAmount,
            totalAmount: priced.quote.totalAmount,
            commissionRatePercent: rate,
            commissionAmount: Math.round((priced.quote.rentalAmount * rate) / 100),
            termsAcceptedAt: now,
            createdAt: now,
            approvalDeadlineAt: car.instantBook ? null : approvalDeadline(now, startAt),
            paymentDeadlineAt: car.instantBook ? paymentDeadline(now, startAt) : null,
          },
          car.instantBook,
          { role: 'RENTER', userId: renterId },
          now,
        );
        return booking.id;
      }, TX_OPTIONS);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.message.includes('bookings_no_overlap')
      )
        throw unavailable();
      throw error;
    }
    await this.outbox.flushBooking(bookingId);
    return this.view(bookingId, renterId);
  }

  async accept(ownerId: string, bookingId: string, requestedAt?: Date): Promise<Booking> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const reference = await tx.booking.findFirst({
        where: { id: bookingId, ownerId },
        select: { renterId: true, carId: true },
      });
      if (!reference) throw notFound();
      await lockParticipants(tx, reference.renterId, ownerId);
      const booking = await this.state.lock(tx, bookingId);
      const now = requestedAt ?? new Date();
      if (await this.state.expire(tx, booking.id, now)) return { expired: true };
      const snapshot = bookingSnapshotSchema.parse(booking.pricingSnapshot);
      if (booking.status === 'AWAITING_PAYMENT' && !snapshot.instantBook) return { expired: false };
      if (booking.status !== 'PENDING_APPROVAL') throw statusConflict();
      const car = await getRentalCar(tx, booking.carId, now);
      await assertEligibility(tx, booking.renterId, car, booking.startAt, booking.endAt);
      await this.expiry.expireForCar(tx, booking.carId, now);
      if (!(await this.availability.isRangeFree(tx, booking.carId, booking, booking.id)))
        throw unavailable();
      const decisionAt = requestedAt ?? new Date();
      if (await this.state.expire(tx, booking.id, decisionAt)) return { expired: true };
      await this.state.transition(
        tx,
        booking.id,
        'AWAITING_PAYMENT',
        { role: 'OWNER', userId: ownerId },
        decisionAt,
        { paymentDeadlineAt: paymentDeadline(decisionAt, booking.startAt) },
      );
      return { expired: false };
    }, TX_OPTIONS);
    await this.outbox.flushBooking(bookingId);
    if (outcome.expired) throw expired();
    return this.view(bookingId, ownerId);
  }

  async reject(
    ownerId: string,
    bookingId: string,
    reason?: string,
    requestedAt?: Date,
  ): Promise<Booking> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const booking = await this.state.lock(tx, bookingId);
      if (booking.ownerId !== ownerId) throw notFound();
      const now = requestedAt ?? new Date();
      if (await this.state.expire(tx, booking.id, now)) return { expired: true };
      if (booking.status === 'CANCELLED' && booking.cancelledBy === 'OWNER')
        return { expired: false };
      if (booking.status !== 'PENDING_APPROVAL') throw statusConflict();
      await this.state.transition(
        tx,
        booking.id,
        'CANCELLED',
        { role: 'OWNER', userId: ownerId },
        now,
        { note: reason || 'Chủ xe đã từ chối yêu cầu đặt xe.' },
      );
      return { expired: false };
    }, TX_OPTIONS);
    await this.outbox.flushBooking(bookingId);
    if (outcome.expired) throw expired();
    return this.view(bookingId, ownerId);
  }

  /** CARENTA-30 calls this before creating the actual provider payment URL. */
  async beginCheckout(renterId: string, bookingId: string, requestedAt?: Date): Promise<Booking> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const booking = await this.state.lock(tx, bookingId);
      if (booking.renterId !== renterId) throw notFound();
      const now = requestedAt ?? new Date();
      if (await this.state.expire(tx, booking.id, now)) return { expired: true };
      if (booking.status !== 'AWAITING_PAYMENT' || !booking.paymentDeadlineAt)
        throw statusConflict();
      if (!booking.checkoutStartedAt) {
        const deadline = checkoutDeadline(now, booking.paymentDeadlineAt);
        await tx.booking.update({
          where: { id: booking.id },
          data: { checkoutStartedAt: now, paymentDeadlineAt: deadline },
        });
        await writeBookingJob(tx, booking.id, BOOKING_JOBS.payment, null);
        await writeBookingJob(tx, booking.id, BOOKING_JOBS.hold, deadline);
      }
      return { expired: false };
    }, TX_OPTIONS);
    await this.outbox.flushBooking(bookingId);
    if (outcome.expired) throw expired();
    return this.view(bookingId, renterId);
  }

  async get(userId: string, bookingId: string, now?: Date): Promise<Booking> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, OR: [{ renterId: userId }, { ownerId: userId }] },
      select: { id: true },
    });
    if (!booking) throw notFound();
    await this.expiry.expire(booking.id, now);
    return this.view(booking.id, userId);
  }

  async list(
    userId: string,
    role: 'RENTER' | 'OWNER',
    query: BookingListQuery,
    now = new Date(),
  ): Promise<BookingPage> {
    const party = role === 'RENTER' ? { renterId: userId } : { ownerId: userId };
    const due = await this.prisma.booking.findMany({
      where: {
        ...party,
        OR: [
          { status: 'PENDING_APPROVAL', approvalDeadlineAt: { lte: now } },
          { status: 'AWAITING_PAYMENT', paymentDeadlineAt: { lte: now } },
        ],
      },
      select: { id: true },
    });
    await Promise.all(due.map((row) => this.expiry.expire(row.id, now)));
    const where = { ...party, status: query.status };
    const [rows, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.pageSize,
        skip: (query.page - 1) * query.pageSize,
        include: BOOKING_VIEW_INCLUDE,
      }),
      this.prisma.booking.count({ where }),
    ]);
    return {
      items: rows.map((row) => {
        const { history: _history, ...summary } = toBooking(this.uploads, row, userId);
        return summary;
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Unpaid lock cancellations are atomic with the account lock. Paid refunds are CARENTA-32/30. */
  async cancelUnpaidForUser(tx: Tx, userId: string, adminId: string, now: Date): Promise<string[]> {
    const rows = await tx.booking.findMany({
      where: {
        OR: [{ renterId: userId }, { ownerId: userId }],
        status: { in: ['PENDING_APPROVAL', 'AWAITING_PAYMENT'] },
      },
      orderBy: [{ carId: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    for (const row of rows) {
      // oxlint-disable-next-line no-await-in-loop -- preserve global car/booking lock order
      const current = await this.state.lock(tx, row.id);
      if (current.status === 'PENDING_APPROVAL' || current.status === 'AWAITING_PAYMENT') {
        // oxlint-disable-next-line no-await-in-loop -- preserve global car/booking lock order
        await this.state.transition(
          tx,
          row.id,
          'CANCELLED',
          { role: 'ADMIN', userId: adminId },
          now,
          { note: 'Đơn thuê đã bị huỷ do một tài khoản liên quan bị khoá.' },
        );
      }
    }
    return rows.map((row) => row.id);
  }

  private async view(bookingId: string, viewerId: string): Promise<Booking> {
    const row = await this.prisma.booking.findFirst({
      where: { id: bookingId, OR: [{ renterId: viewerId }, { ownerId: viewerId }] },
      include: BOOKING_VIEW_INCLUDE,
    });
    if (!row) throw notFound();
    return toBooking(this.uploads, row, viewerId);
  }
}

function assertTripWindow(start: Date, end: Date, now: Date): void {
  const issue = tripWindowIssue(start, end, now);
  if (issue)
    throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, issue.message, [
      issue,
    ]);
}

async function lockParticipants(tx: Tx, renterId: string, ownerId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id IN (${Prisma.join([renterId, ownerId].toSorted().map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`;
}

async function getRentalCar(tx: Tx, carId: string, now: Date): Promise<RentalCar> {
  const car = await tx.car.findFirst({
    where: { id: carId, ...listedCarWhere(now) },
    include: { pricing: true },
  });
  if (!car?.pricing)
    throw new AppException(
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      'Không tìm thấy xe đang hiển thị.',
    );
  // An interactive transaction owns one pg connection. Loading multiple independent
  // relations through Prisma's query strategy otherwise queues concurrent client queries.
  const model = await tx.carModel.findUniqueOrThrow({
    where: { id: car.modelId },
    ...modelWithMake,
  });
  const photos = await tx.carPhoto.findMany({
    where: { carId },
    orderBy: { position: 'asc' },
    take: 1,
    select: { fileKey: true },
  });
  return { ...car, model, photos };
}

async function assertEligibility(
  tx: Tx,
  renterId: string,
  car: RentalCar,
  startAt: Date,
  endAt: Date,
): Promise<void> {
  const renter = await tx.user.findUniqueOrThrow({
    where: { id: renterId },
    select: {
      status: true,
      emailVerifiedAt: true,
      driverLicenses: {
        where: { status: { in: ['APPROVED', 'EXPIRED'] } },
        orderBy: { reviewedAt: 'desc' },
      },
    },
  });
  if (renter.status !== 'ACTIVE')
    throw new AppException(
      HttpStatus.FORBIDDEN,
      ErrorCode.ACCOUNT_LOCKED,
      'Tài khoản người thuê đã bị khoá.',
    );
  if (!renter.emailVerifiedAt)
    throw new AppException(
      HttpStatus.FORBIDDEN,
      ErrorCode.EMAIL_NOT_VERIFIED,
      'Người thuê cần xác thực email trước khi đặt xe.',
    );
  const current =
    renter.driverLicenses.find((license) => license.status === 'APPROVED') ??
    renter.driverLicenses[0];
  const issues = rentalEligibilityIssues({
    license: current
      ? {
          status: current.status,
          licenseClass: current.licenseClass,
          dateOfBirth: toDateOnly(current.dateOfBirth),
          expiresOn: toDateOnly(current.expiresOn),
        }
      : null,
    car,
    pickupDate: vietnamDate(startAt),
    returnDate: vietnamDate(endAt),
  });
  if (issues.length > 0)
    throw new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.BOOKING_ELIGIBILITY_FAILED,
      issues[0]?.message ?? 'GPLX chưa đủ điều kiện thuê xe.',
      issues.map((issue) => ({ path: `driverLicense.${issue.code}`, message: issue.message })),
    );
}

function makeSnapshot(car: RentalCar, holidays: string[]): BookingSnapshot {
  if (!car.pricing) throw new Error('Missing locked car pricing');
  return {
    version: 1,
    instantBook: car.instantBook,
    bufferMinutes: car.bufferMinutes,
    pricing: toPricingView(car.pricing),
    depositAmount: car.depositAmount,
    delivery: toDeliveryView(car),
    holidays,
    mileageLimit:
      car.dailyKmLimit !== null && car.extraKmFee !== null
        ? { dailyKm: car.dailyKmLimit, extraFeePerKm: car.extraKmFee }
        : null,
    rules: {
      noSmoking: car.ruleNoSmoking,
      noPets: car.ruleNoPets,
      noDurianSeafood: car.ruleNoDurianSeafood,
      sameFuelLevel: car.ruleSameFuelLevel,
      keepClean: car.ruleKeepClean,
      note: car.rulesNote,
    },
    car: {
      make: car.model.make,
      model: { id: car.model.id, name: car.model.name },
      year: car.year,
      licensePlate: car.licensePlate,
      coverPhotoKey: car.photos[0]?.fileKey ?? null,
      province: car.province,
      ward: car.ward,
      addressLine: car.addressLine,
      latitude: car.latitude.toNumber(),
      longitude: car.longitude.toNumber(),
      approxLatitude: car.approxLatitude.toNumber(),
      approxLongitude: car.approxLongitude.toNumber(),
    },
  };
}

function requestFingerprint(input: CreateBookingInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        carId: input.carId,
        startAt: new Date(input.startAt).toISOString(),
        endAt: new Date(input.endAt).toISOString(),
        pickupMethod: input.pickupMethod,
        deliveryLocation: input.pickupMethod === 'DELIVERY' ? input.deliveryLocation : null,
        deliveryAddress: input.pickupMethod === 'DELIVERY' ? input.deliveryAddress : null,
        termsAccepted: input.termsAccepted,
      }),
    )
    .digest('hex');
}
