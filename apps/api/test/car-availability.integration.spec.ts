import { randomInt, randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { z } from 'zod';

import {
  apiErrorSchema,
  authUserSchema,
  availabilityBlockSchema,
  carAvailabilitySchema,
  carSearchPageSchema,
  ErrorCode,
} from '@carenta/shared';

import { CarAvailabilityService } from '../src/cars/car-availability.service.js';
import { type BookingStatus, type Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

const HOUR = 3_600_000;
const errorOf = (response: request.Response) => apiErrorSchema.parse(response.body);
const blockOf = (response: request.Response) => availabilityBlockSchema.parse(response.body);
const calendarOf = (response: request.Response) => carAvailabilitySchema.parse(response.body);
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
const month = '2026-12';
const at = (day: number, hour = 0) => new Date(Date.UTC(2026, 11, day, hour - 7));
const period = (startAt: Date, endAt: Date) => ({
  startAt: startAt.toISOString(),
  endAt: endAt.toISOString(),
});

describe.runIf(process.env.INTEGRATION === '1')('car availability', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let availability: CarAvailabilityService;
  const tag = randomUUID().slice(0, 8);
  const emails: string[] = [];
  const userIds: string[] = [];
  let makeId: number;
  let modelId: number;
  let carId: string;

  async function signUp(verified = true) {
    const agent = request.agent(app.getHttpServer());
    const email = `availability-${randomUUID()}@example.com`;
    emails.push(email);
    const response = await agent
      .post('/api/v1/auth/register')
      .send({ email, password: 'mat khau', fullName: 'Chủ Xe' })
      .expect(201);
    const user = authUserSchema.parse(response.body);
    userIds.push(user.id);
    if (verified)
      await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    return { agent, user };
  }

  let owner: Awaited<ReturnType<typeof signUp>>;
  let other: Awaited<ReturnType<typeof signUp>>;
  let unverified: Awaited<ReturnType<typeof signUp>>;

  async function seedCar() {
    const digits = String(randomInt(0, 100_000)).padStart(5, '0');
    return prisma.car.create({
      data: {
        ownerId: owner.user.id,
        modelId,
        year: 2022,
        licensePlate: `97S-${digits.slice(0, 3)}.${digits.slice(3)}`,
        color: 'Trắng',
        bodyType: 'SEDAN',
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'GASOLINE',
        odometerKm: 20_000,
        province: `Availability ${tag}`,
        ward: 'Phường Bến Thành',
        addressLine: '1 Lê Lợi',
        latitude: 10.77,
        longitude: 106.7,
        status: 'ACTIVE',
        bufferMinutes: 120,
        pricing: {
          create: {
            hourlyPrice: 80_000,
            dailyPrice: 800_000,
            minDurationHours: 1,
            maxDurationDays: 30,
          },
        },
      },
    });
  }

  function seedBooking(
    status: BookingStatus,
    startAt = at(10, 10),
    endAt = at(10, 12),
    bufferMinutes = 120,
    tx: Prisma.TransactionClient = prisma,
  ) {
    return tx.booking.create({
      data: {
        carId,
        ownerId: owner.user.id,
        renterId: other.user.id,
        status,
        startAt,
        endAt,
        blockedUntil: new Date(endAt.getTime() + bufferMinutes * 60_000),
        pickupMethod: 'SELF_PICKUP',
        pricingSnapshot: {},
        priceBreakdown: {},
        rentalAmount: 800_000,
        deliveryFee: 0,
        depositAmount: 0,
        totalAmount: 800_000,
        commissionRatePercent: 15,
        commissionAmount: 120_000,
        termsAcceptedAt: new Date(),
      },
    });
  }

  const blocksUrl = () => `/api/v1/owner/cars/${carId}/availability-blocks`;
  const calendarUrl = () => `/api/v1/cars/${carId}/availability`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    availability = app.get(CarAvailabilityService);
    const make = await prisma.carMake.create({
      data: {
        name: `Availability ${tag}`,
        slug: `availability-${tag}`,
        models: { create: { name: 'Alpha', slug: 'alpha' } },
      },
      include: { models: true },
    });
    makeId = make.id;
    modelId = make.models[0]!.id;
    owner = await signUp();
    other = await signUp();
    unverified = await signUp(false);
  });

  beforeEach(async () => {
    carId = (await seedCar()).id;
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({ where: { car: { ownerId: owner.user.id } } });
    await prisma.car.deleteMany({ where: { ownerId: owner.user.id } });
    await prisma.user.update({ where: { id: owner.user.id }, data: { status: 'ACTIVE' } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.carModel.deleteMany({ where: { makeId } });
    await prisma.carMake.delete({ where: { id: makeId } });
    await app.close();
  });

  it('creates, lists, replaces and deletes overlapping owner blocks independently', async () => {
    const first = blockOf(
      await owner.agent
        .post(blocksUrl())
        .send({ ...period(at(0, 23), at(2, 10)), reason: '  Bảo dưỡng  ' })
        .expect(201),
    );
    const second = blockOf(
      await owner.agent
        .post(blocksUrl())
        .send(period(at(1, 10), at(3)))
        .expect(201),
    );
    expect(first.reason).toBe('Bảo dưỡng');
    const list = z
      .array(availabilityBlockSchema)
      .parse((await owner.agent.get(blocksUrl()).query({ month }).expect(200)).body);
    expect(list.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(list[0]?.startAt).toBe(at(0, 23).toISOString());
    const changed = blockOf(
      await owner.agent
        .put(`${blocksUrl()}/${first.id}`)
        .send(period(at(2), at(4)))
        .expect(200),
    );
    expect(changed.reason).toBeNull();
    await owner.agent.delete(`${blocksUrl()}/${first.id}`).expect(204);
    const remaining = z
      .array(availabilityBlockSchema)
      .parse((await owner.agent.get(blocksUrl()).query({ month }).expect(200)).body);
    expect(remaining.map((item) => item.id)).toEqual([second.id]);
    await owner.agent.delete(`${blocksUrl()}/${first.id}`).expect(404);
    await owner.agent
      .put(`${blocksUrl()}/${first.id}`)
      .send(period(at(2), at(4)))
      .expect(404);
  });

  it('requires authentication, verified email, resource ownership and matching car/block ids', async () => {
    const input = period(at(2), at(3));
    await request(app.getHttpServer()).post(blocksUrl()).send(input).expect(401);
    expect(errorOf(await unverified.agent.post(blocksUrl()).send(input).expect(403)).code).toBe(
      ErrorCode.EMAIL_NOT_VERIFIED,
    );
    const block = blockOf(await owner.agent.post(blocksUrl()).send(input).expect(201));
    await other.agent.post(blocksUrl()).send(input).expect(404);
    await other.agent.get(blocksUrl()).query({ month }).expect(404);
    await other.agent.get(`/api/v1/owner/cars/${carId}/availability`).query({ month }).expect(404);
    await other.agent.put(`${blocksUrl()}/${block.id}`).send(input).expect(404);
    await other.agent.delete(`${blocksUrl()}/${block.id}`).expect(404);
    const otherCar = await seedCar();
    const wrongParent = `/api/v1/owner/cars/${otherCar.id}/availability-blocks/${block.id}`;
    await owner.agent.put(wrongParent).send(input).expect(404);
    await owner.agent.delete(wrongParent).expect(404);
    await owner.agent
      .post(`/api/v1/owner/cars/${randomUUID()}/availability-blocks`)
      .send(input)
      .expect(404);
  });

  it.each(['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] as const)(
    'rejects overlap with %s, including its locked buffer, with half-open boundaries',
    async (status) => {
      await seedBooking(status);
      await prisma.car.update({ where: { id: carId }, data: { bufferMinutes: 0 } });
      await Promise.all(
        [
          [9, 11],
          [10, 12],
          [13, 14],
          [9, 15],
        ].map(async ([start, end]) => {
          const response = await owner.agent
            .post(blocksUrl())
            .send(period(at(10, start), at(10, end)))
            .expect(409);
          expect(errorOf(response).code).toBe(ErrorCode.AVAILABILITY_BOOKING_CONFLICT);
        }),
      );
      await owner.agent
        .post(blocksUrl())
        .send(period(at(10, 9), at(10, 10)))
        .expect(201);
      await owner.agent
        .post(blocksUrl())
        .send(period(at(10, 14), at(10, 15)))
        .expect(201);
      const editable = blockOf(
        await owner.agent
          .post(blocksUrl())
          .send(period(at(11), at(12)))
          .expect(201),
      );
      await owner.agent
        .put(`${blocksUrl()}/${editable.id}`)
        .send(period(at(10, 13), at(11)))
        .expect(409);
      expect(
        (await prisma.availabilityBlock.findUniqueOrThrow({ where: { id: editable.id } })).startAt,
      ).toEqual(at(11));
    },
  );

  it.each(['PENDING_APPROVAL', 'RETURNED', 'COMPLETED', 'CANCELLED', 'DISPUTED'] as const)(
    'does not treat %s as occupying the calendar',
    async (status) => {
      await seedBooking(status);
      expect(
        calendarOf(
          await request(app.getHttpServer()).get(calendarUrl()).query({ month }).expect(200),
        ).busy,
      ).toEqual([]);
      await owner.agent
        .post(blocksUrl())
        .send(period(at(10), at(11)))
        .expect(201);
    },
  );

  it('publishes only clipped merged periods, includes buffers crossing a month, and never discloses their source', async () => {
    const secret = 'Lý do riêng tư';
    await owner.agent
      .post(blocksUrl())
      .send({ ...period(at(0, 23), at(2)), reason: secret })
      .expect(201);
    await owner.agent
      .post(blocksUrl())
      .send(period(at(1, 20), at(3)))
      .expect(201);
    await seedBooking('AWAITING_PAYMENT', at(3), at(3, 12));
    await seedBooking('CONFIRMED', at(31, 23), new Date('2027-01-01T02:00:00+07:00'));
    // Only the buffer of this November booking extends into December.
    await seedBooking('IN_PROGRESS', at(0, 20), at(0, 23), 120);
    const response = await request(app.getHttpServer())
      .get(calendarUrl())
      .query({ month })
      .expect(200);
    expect(response.body).toEqual({
      month,
      busy: [period(at(1), at(3, 14)), period(at(31, 23), new Date('2027-01-01T00:00:00+07:00'))],
    });
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(JSON.stringify(response.body)).not.toContain(owner.user.id);
    expect(
      calendarOf(
        await owner.agent
          .get(`/api/v1/owner/cars/${carId}/availability`)
          .query({ month })
          .expect(200),
      ),
    ).toEqual(calendarOf(response));
  });

  it('filters owner blocks by Vietnam month intersection and excludes touching month boundaries', async () => {
    await owner.agent
      .post(blocksUrl())
      .send(period(at(0), at(1)))
      .expect(201);
    await owner.agent
      .post(blocksUrl())
      .send(period(new Date('2027-01-01T00:00:00+07:00'), new Date('2027-01-02T00:00:00+07:00')))
      .expect(201);
    const inside = blockOf(
      await owner.agent
        .post(blocksUrl())
        .send(period(at(1), at(2)))
        .expect(201),
    );
    const list = z
      .array(availabilityBlockSchema)
      .parse((await owner.agent.get(blocksUrl()).query({ month }).expect(200)).body);
    expect(list.map((item) => item.id)).toEqual([inside.id]);
  });

  it.each(['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'PAUSED', 'HIDDEN', 'REMOVED'] as const)(
    'returns 404 publicly for %s cars while the owner can read the calendar',
    async (status) => {
      await prisma.car.update({ where: { id: carId }, data: { status } });
      const hidden = await request(app.getHttpServer())
        .get(calendarUrl())
        .query({ month })
        .expect(404);
      expect(errorOf(hidden).code).toBe(ErrorCode.NOT_FOUND);
      const visible = await owner.agent
        .get(`/api/v1/owner/cars/${carId}/availability`)
        .query({ month })
        .expect(200);
      expect(calendarOf(visible).busy).toEqual([]);
    },
  );

  it('hides cars with locked owners or active temporary hiding and restores expired hiding', async () => {
    await prisma.car.update({
      where: { id: carId },
      data: { status: 'ACTIVE', hiddenUntil: new Date(Date.now() + HOUR) },
    });
    await request(app.getHttpServer()).get(calendarUrl()).query({ month }).expect(404);
    await prisma.car.update({
      where: { id: carId },
      data: { hiddenUntil: new Date(Date.now() - HOUR) },
    });
    await request(app.getHttpServer()).get(calendarUrl()).query({ month }).expect(200);
    await prisma.user.update({ where: { id: owner.user.id }, data: { status: 'LOCKED' } });
    await request(app.getHttpServer()).get(calendarUrl()).query({ month }).expect(404);
    const missing = await request(app.getHttpServer())
      .get(`/api/v1/cars/${randomUUID()}/availability`)
      .query({ month })
      .expect(404);
    expect(errorOf(missing).code).toBe(ErrorCode.NOT_FOUND);
  });

  it('prevents all block writes after an admin removes a car', async () => {
    const block = blockOf(
      await owner.agent
        .post(blocksUrl())
        .send(period(at(2), at(3)))
        .expect(201),
    );
    await prisma.car.update({ where: { id: carId }, data: { status: 'REMOVED' } });
    expect(
      errorOf(
        await owner.agent
          .post(blocksUrl())
          .send(period(at(4), at(5)))
          .expect(409),
      ).code,
    ).toBe(ErrorCode.CAR_STATUS_CONFLICT);
    await owner.agent
      .put(`${blocksUrl()}/${block.id}`)
      .send(period(at(4), at(5)))
      .expect(409);
    await owner.agent.delete(`${blocksUrl()}/${block.id}`).expect(409);
  });

  it('validates malformed ids, month, reversed ranges and time steps over HTTP', async () => {
    const response = await owner.agent
      .post(blocksUrl())
      .send(period(at(2), at(1)))
      .expect(400);
    expect(errorOf(response).code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(errorOf(response).details?.some((detail) => detail.path === 'endAt')).toBe(true);
    await owner.agent
      .post(blocksUrl())
      .send({ startAt: 'invalid', endAt: at(3).toISOString() })
      .expect(400);
    await owner.agent
      .post(blocksUrl())
      .send(period(new Date(at(2).getTime() + 15 * 60_000), at(3)))
      .expect(400);
    await owner.agent.get(blocksUrl()).expect(400);
    await request(app.getHttpServer()).get(calendarUrl()).query({ month: '2026-13' }).expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/cars/not-a-uuid/availability')
      .query({ month })
      .expect(400);
  });

  it('uses identical availability rules in search and the transactional helper, including buffers on both sides', async () => {
    const start = new Date(Date.now() + 48 * HOUR);
    start.setUTCMinutes(0, 0, 0);
    const later = (hours: number) => new Date(start.getTime() + hours * HOUR);
    await prisma.availabilityBlock.create({
      data: { carId, startAt: later(12), endAt: later(14) },
    });
    const booking = await seedBooking('CONFIRMED', later(24), later(48), 240);
    await Promise.all(
      (
        [
          [0, 12, true],
          [11, 13, false],
          [14, 20, true],
          [20, 22, true],
          [21, 23, false],
          [48, 49, false],
          [51, 53, false],
          [52, 54, true],
        ] as const
      ).map(async ([from, to, expected]) => {
        const startAt = later(from);
        const endAt = later(to);
        const free = await prisma.$transaction((tx) =>
          availability.isRangeFree(tx, carId, { startAt, endAt, blockedUntil: later(to + 2) }),
        );
        expect(free, `helper ${from}–${to}`).toBe(expected);
        const page = carSearchPageSchema.parse(
          (
            await request(app.getHttpServer())
              .get('/api/v1/cars')
              .query({ province: `Availability ${tag}`, ...period(startAt, endAt) })
              .expect(200)
          ).body,
        );
        expect(
          page.items.some((car) => car.id === carId),
          `search ${from}–${to}`,
        ).toBe(expected);
      }),
    );
    const ownRange = { startAt: later(24), endAt: later(48), blockedUntil: later(52) };
    expect(
      await prisma.$transaction((tx) => availability.isRangeFree(tx, carId, ownRange, booking.id)),
    ).toBe(true);
    expect(
      await prisma.$transaction((tx) => availability.isRangeFree(tx, randomUUID(), ownRange)),
    ).toBe(false);
  });

  it('serializes a new booking and a competing owner block on the same car lock', async () => {
    const checked = signal();
    const finishBooking = signal();
    const bookingWrite = prisma.$transaction(async (tx) => {
      const free = await availability.isRangeFree(tx, carId, {
        startAt: at(10, 10),
        endAt: at(10, 12),
        blockedUntil: at(10, 14),
      });
      expect(free).toBe(true);
      checked.resolve();
      await finishBooking.promise;
      return seedBooking('CONFIRMED', at(10, 10), at(10, 12), 120, tx);
    });
    await checked.promise;
    // Start the competing writer while the booking transaction still owns the lock.
    const blockWrite = availability.createBlock(owner.user.id, carId, period(at(10, 13), at(11)));
    const outcome = blockWrite.then(
      () => null,
      (error: unknown) => error,
    );
    finishBooking.resolve();
    await bookingWrite;
    expect(await outcome).toMatchObject({ code: ErrorCode.AVAILABILITY_BOOKING_CONFLICT });
    expect(await prisma.availabilityBlock.count({ where: { carId } })).toBe(0);
  });
});
