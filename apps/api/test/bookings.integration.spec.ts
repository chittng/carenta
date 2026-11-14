import { randomInt, randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';

import {
  apiErrorSchema,
  authUserSchema,
  bookingPageSchema,
  bookingSchema,
  chargedKm,
  createBookingSchema,
  ErrorCode,
  maskLicensePlate,
  priceQuoteSchema,
  vietnamDate,
} from '@carenta/shared';

import { BookingExpiryService } from '../src/bookings/booking-expiry.service.js';
import { BookingJobOutboxService } from '../src/bookings/booking-job-outbox.service.js';
import { BOOKING_JOBS, bookingJobId } from '../src/bookings/booking-jobs.js';
import { BookingStateMachine } from '../src/bookings/booking-state-machine.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { fromDateOnly } from '../src/common/dates.js';
import { ConsoleUsersService } from '../src/console/console-users.service.js';
import { type Prisma } from '../src/generated/prisma/client.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

const HOUR = 3_600_000;
const bookingOf = (res: request.Response) => bookingSchema.parse(res.body);
const errorOf = (res: request.Response) => apiErrorSchema.parse(res.body);
const ownerUrl = (id: string, action: string) => `/api/v1/owner/bookings/${id}/${action}`;
const bookingUrl = (id: string) => `/api/v1/bookings/${id}`;
const randomPlate = () => {
  const n = String(randomInt(0, 100_000)).padStart(5, '0');
  return `95S-${n.slice(0, 3)}.${n.slice(3)}`;
};

describe.runIf(process.env.INTEGRATION === '1')('bookings', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let bookings: BookingsService;
  let state: BookingStateMachine;
  let expiry: BookingExpiryService;
  let outbox: BookingJobOutboxService;
  let jobs: JobsService;
  let queue: Queue;
  let redis: Redis;
  const tag = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const licenseNumbers: string[] = [];
  let modelId: number;
  let makeId: number;
  const start = new Date(Math.ceil((Date.now() + 48 * HOUR) / HOUR) * HOUR);
  const later = (hours: number) => new Date(start.getTime() + hours * HOUR);

  async function signUp(name: string, verified = true) {
    const agent = request.agent(app.getHttpServer());
    const email = `booking-${randomUUID()}@example.com`;
    const response = await agent
      .post('/api/v1/auth/register')
      .send({ email, password: 'mat khau', fullName: name })
      .expect(201);
    const user = authUserSchema.parse(response.body);
    userIds.push(user.id);
    if (verified)
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date(), phone: '0912345678' },
      });
    return { agent, id: user.id, email };
  }
  type Person = Awaited<ReturnType<typeof signUp>>;
  let owner: Person;
  let renter: Person;
  let other: Person;
  let unverified: Person;
  let admin: Person;

  async function license(
    userId: string,
    overrides: Partial<Prisma.DriverLicenseUncheckedCreateInput> = {},
  ) {
    const number = String(randomInt(100_000_000, 999_999_999)) + String(randomInt(100, 999));
    licenseNumbers.push(number);
    return prisma.driverLicense.create({
      data: {
        userId,
        fullName: 'NGUOI THUE',
        licenseNumber: number,
        licenseClass: 'B',
        status: 'APPROVED',
        dateOfBirth: new Date('1990-01-01T00:00:00Z'),
        expiresOn: new Date('2035-12-31T00:00:00Z'),
        frontImageKey: `license/${tag}/front.jpg`,
        backImageKey: `license/${tag}/back.jpg`,
        ...overrides,
      },
    });
  }

  async function seedCar(
    overrides: Partial<Prisma.CarUncheckedCreateInput> = {},
    pricing: Partial<Prisma.CarPricingCreateWithoutCarInput> = {},
  ) {
    return prisma.car.create({
      data: {
        ownerId: owner.id,
        modelId,
        year: 2022,
        licensePlate: randomPlate(),
        color: 'Trắng',
        bodyType: 'SEDAN',
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'GASOLINE',
        odometerKm: 20_000,
        province: `Booking ${tag}`,
        ward: 'Phường Bến Thành',
        addressLine: `Địa chỉ riêng ${tag}`,
        latitude: 10.77,
        longitude: 106.7,
        status: 'ACTIVE',
        instantBook: true,
        depositAmount: 5_000_000,
        bufferMinutes: 120,
        ...overrides,
        pricing: {
          create: {
            hourlyPrice: 80_000,
            dailyPrice: 800_000,
            minDurationHours: 1,
            maxDurationDays: 180,
            ...pricing,
          },
        },
        photos: { create: { fileKey: `cars/${tag}/cover.webp`, position: 0 } },
      },
      include: { pricing: true },
    });
  }

  const input = (carId: string, changes: Record<string, unknown> = {}) => ({
    carId,
    requestId: randomUUID(),
    startAt: later(0).toISOString(),
    endAt: later(24).toISOString(),
    pickupMethod: 'SELF_PICKUP',
    termsAccepted: true,
    ...changes,
  });
  const create = async (carId: string, changes: Record<string, unknown> = {}, person = renter) =>
    bookingOf(await person.agent.post('/api/v1/bookings').send(input(carId, changes)).expect(201));

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    bookings = app.get(BookingsService);
    state = app.get(BookingStateMachine);
    expiry = app.get(BookingExpiryService);
    outbox = app.get(BookingJobOutboxService);
    jobs = app.get(JobsService);
    redis = new Redis(process.env.VALKEY_URL ?? 'redis://localhost:6379/1', {
      maxRetriesPerRequest: 1,
    });
    queue = new Queue('scheduled', { connection: redis, prefix: 'carenta' });
    const make = await prisma.carMake.create({
      data: {
        name: `Booking ${tag}`,
        slug: `booking-${tag}`,
        models: { create: { name: 'Alpha', slug: 'alpha' } },
      },
      include: { models: true },
    });
    makeId = make.id;
    modelId = make.models[0]!.id;
    owner = await signUp('Chủ Xe');
    renter = await signUp('Người Thuê');
    other = await signUp('Người Thuê Khác');
    unverified = await signUp('Chưa Xác Thực', false);
    admin = await signUp('Quản Trị');
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
  });

  beforeEach(async () => {
    await license(renter.id);
    await license(other.id);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    const rows = await prisma.booking.findMany({
      where: { car: { ownerId: { in: userIds } } },
      select: { id: true },
    });
    await Promise.all(
      rows.flatMap((row) =>
        Object.values(BOOKING_JOBS).map((name) => jobs.cancel(bookingJobId(name, row.id))),
      ),
    );
    await prisma.booking.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    await prisma.car.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.driverLicense.deleteMany({ where: { userId: { in: userIds } } });
  });
  afterAll(async () => {
    await queue.close();
    await redis.quit();
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.carModel.deleteMany({ where: { makeId } });
    await prisma.carMake.delete({ where: { id: makeId } });
    await app.close();
  });

  it('creates an instant booking with server pricing, an initial log, a fixed queue job and no client-controlled fields', async () => {
    const car = await seedCar();
    const payload = input(car.id, {
      status: 'CONFIRMED',
      totalAmount: 1,
      depositAmount: 0,
      bufferMinutes: 0,
      termsAcceptedAt: '2000-01-01T00:00:00Z',
    });
    const quoted = priceQuoteSchema.parse(
      (
        await request(app.getHttpServer())
          .post(`/api/v1/cars/${car.id}/quote`)
          .send(payload)
          .expect(200)
      ).body,
    );
    const response = await renter.agent.post('/api/v1/bookings').send(payload).expect(201);
    const booking = bookingOf(response);
    expect(booking.status).toBe('AWAITING_PAYMENT');
    expect(booking.priceBreakdown).toEqual(quoted);
    expect(booking.bufferMinutes).toBe(120);
    expect(booking.blockedUntil).toBe(later(26).toISOString());
    expect(booking.approvalDeadlineAt).toBeNull();
    expect(booking.checkoutStartedAt).toBeNull();
    expect(Date.parse(booking.paymentDeadlineAt!) - Date.parse(booking.createdAt)).toBe(
      30 * 60_000,
    );
    expect(booking.history).toMatchObject([
      { fromStatus: null, toStatus: 'AWAITING_PAYMENT', actorRole: 'RENTER' },
    ]);
    const saved = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(saved.totalAmount).toBe(BigInt(quoted.totalAmount));
    expect(saved.commissionAmount).toBe(
      BigInt(Math.round((quoted.rentalAmount * saved.commissionRatePercent) / 100)),
    );
    expect(saved.termsAcceptedAt).not.toEqual(new Date('2000-01-01T00:00:00Z'));
    const job = await queue.getJob(bookingJobId(BOOKING_JOBS.payment, booking.id));
    expect(job?.name).toBe(BOOKING_JOBS.payment);
    expect(job!.timestamp + job!.delay).toBeCloseTo(Date.parse(booking.paymentDeadlineAt!), -3);
    expect(await prisma.bookingJobOutbox.count({ where: { bookingId: booking.id } })).toBe(0);
    expect(booking.car.licensePlate).toBe(maskLicensePlate(car.licensePlate));
    expect(booking.car.location.addressLine).toBeNull();
    expect(booking.car.location.latitude).toBe(car.approxLatitude.toNumber());
    expect(booking.owner.phone).toBeNull();
    expect(JSON.stringify(response.body)).not.toMatch(
      /pricingSnapshot|requestFingerprint|frontImageKey|passwordHash|"email"/,
    );
    expect(JSON.stringify(response.body)).not.toContain(car.addressLine);
  });

  it('replays the same request across retries without changing the price or deadline, and rejects a changed payload', async () => {
    const car = await seedCar();
    const payload = input(car.id);
    const first = bookingOf(await renter.agent.post('/api/v1/bookings').send(payload).expect(201));
    await prisma.carPricing.update({ where: { carId: car.id }, data: { dailyPrice: 900_000 } });
    const second = bookingOf(await renter.agent.post('/api/v1/bookings').send(payload).expect(201));
    expect(second).toEqual(first);
    expect(await prisma.booking.count({ where: { carId: car.id } })).toBe(1);
    const changed = await renter.agent
      .post('/api/v1/bookings')
      .send({ ...payload, endAt: later(25).toISOString() })
      .expect(409);
    expect(errorOf(changed).code).toBe(ErrorCode.BOOKING_REQUEST_CONFLICT);
    const replay = await bookings.create(renter.id, createBookingSchema.parse(payload), later(100));
    expect(replay.id).toBe(first.id);
    expect(replay.status).toBe('CANCELLED');
    expect(replay.history).toHaveLength(2);
  });

  it('deduplicates simultaneous retries and permits only one competing instant booking', async () => {
    const car = await seedCar();
    const payload = input(car.id);
    const replies = await Promise.all([
      renter.agent.post('/api/v1/bookings').send(payload),
      renter.agent.post('/api/v1/bookings').send(payload),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    expect(bookingOf(replies[0]).id).toBe(bookingOf(replies[1]).id);
    const secondCar = await seedCar();
    const competing = await Promise.all([
      renter.agent.post('/api/v1/bookings').send(input(secondCar.id)),
      other.agent.post('/api/v1/bookings').send(input(secondCar.id)),
    ]);
    expect(competing.map((reply) => reply.status).toSorted((a, b) => a - b)).toEqual([201, 409]);
    expect(await prisma.booking.count({ where: { carId: secondCar.id } })).toBe(1);
  });

  it('allows overlapping manual requests, accepts only one, and preserves prices/buffers despite owner edits', async () => {
    const car = await seedCar({ instantBook: false, bufferMinutes: 240 });
    const first = await create(car.id);
    const second = await create(car.id, {}, other);
    expect(first.status).toBe('PENDING_APPROVAL');
    expect(second.status).toBe('PENDING_APPROVAL');
    expect(Date.parse(first.approvalDeadlineAt!) - Date.parse(first.createdAt)).toBe(6 * HOUR);
    await prisma.car.update({
      where: { id: car.id },
      data: { bufferMinutes: 0, depositAmount: 0, instantBook: true },
    });
    await prisma.carPricing.update({ where: { carId: car.id }, data: { dailyPrice: 2_000_000 } });
    const results = await Promise.all([
      owner.agent.post(ownerUrl(first.id, 'accept')),
      owner.agent.post(ownerUrl(second.id, 'accept')),
    ]);
    expect(results.map((reply) => reply.status).toSorted((a, b) => a - b)).toEqual([200, 409]);
    const accepted = bookingOf(results.find((reply) => reply.status === 200)!);
    expect(accepted.status).toBe('AWAITING_PAYMENT');
    expect(accepted.priceBreakdown).toEqual(first.priceBreakdown);
    expect(accepted.blockedUntil).toBe(later(28).toISOString());
    expect(accepted.bufferMinutes).toBe(240);
    expect(accepted.history.at(-1)).toMatchObject({
      fromStatus: 'PENDING_APPROVAL',
      toStatus: 'AWAITING_PAYMENT',
      actorRole: 'OWNER',
    });
    const replay = bookingOf(await owner.agent.post(ownerUrl(accepted.id, 'accept')).expect(200));
    expect(replay.paymentDeadlineAt).toBe(accepted.paymentDeadlineAt);
    expect(replay.history).toHaveLength(2);
    const loser = accepted.id === first.id ? second.id : first.id;
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: loser } })).status).toBe(
      'PENDING_APPROVAL',
    );
    expect(await prisma.bookingStatusLog.count({ where: { bookingId: loser } })).toBe(1);
  });

  it('lets manual pending requests coexist with a later manual block, then refuses acceptance', async () => {
    const car = await seedCar({ instantBook: false });
    const booking = await create(car.id);
    await owner.agent
      .post(`/api/v1/owner/cars/${car.id}/availability-blocks`)
      .send({ startAt: later(10).toISOString(), endAt: later(12).toISOString() })
      .expect(201);
    expect(errorOf(await owner.agent.post(ownerUrl(booking.id, 'accept')).expect(409)).code).toBe(
      ErrorCode.CAR_UNAVAILABLE,
    );
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'PENDING_APPROVAL',
    );
  });

  it('rechecks car visibility and GPLX at acceptance and leaves an invalid request pending', async () => {
    const car = await seedCar({ instantBook: false });
    const booking = await create(car.id);
    await prisma.car.update({ where: { id: car.id }, data: { status: 'PAUSED' } });
    await owner.agent.post(ownerUrl(booking.id, 'accept')).expect(404);
    await prisma.car.update({
      where: { id: car.id },
      data: { status: 'ACTIVE', transmission: 'MANUAL' },
    });
    await prisma.driverLicense.updateMany({
      where: { userId: renter.id },
      data: { licenseClass: 'LEGACY_B1' },
    });
    const failed = await owner.agent.post(ownerUrl(booking.id, 'accept')).expect(422);
    expect(errorOf(failed).code).toBe(ErrorCode.BOOKING_ELIGIBILITY_FAILED);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'PENDING_APPROVAL',
    );
    await prisma.driverLicense.updateMany({
      where: { userId: renter.id },
      data: { licenseClass: 'B' },
    });
    await owner.agent.post(ownerUrl(booking.id, 'accept')).expect(200);
  });

  it('rejects a manual request once, logs OWNER and cancels its approval timer', async () => {
    const car = await seedCar({ instantBook: false });
    const booking = await create(car.id);
    const rejected = bookingOf(
      await owner.agent
        .post(ownerUrl(booking.id, 'reject'))
        .send({ reason: 'Xe cần bảo dưỡng' })
        .expect(200),
    );
    expect(rejected.status).toBe('CANCELLED');
    expect(rejected.cancellationReason).toBe('Xe cần bảo dưỡng');
    expect(rejected.history.at(-1)?.actorRole).toBe('OWNER');
    const repeated = bookingOf(
      await owner.agent.post(ownerUrl(booking.id, 'reject')).send({ reason: 'Khác' }).expect(200),
    );
    expect(repeated.history).toHaveLength(2);
    expect(repeated.cancellationReason).toBe('Xe cần bảo dưỡng');
    expect(await queue.getJob(bookingJobId(BOOKING_JOBS.approval, booking.id))).toBeUndefined();
  });

  it('caps approval at thirty minutes before pickup for a last-minute manual request', async () => {
    const car = await seedCar({ instantBook: false });
    const pickup = new Date(Math.ceil((Date.now() + 2 * HOUR) / (0.5 * HOUR)) * (0.5 * HOUR));
    const booking = await create(car.id, {
      startAt: pickup.toISOString(),
      endAt: new Date(pickup.getTime() + 24 * HOUR).toISOString(),
    });
    expect(booking.approvalDeadlineAt).toBe(new Date(pickup.getTime() - 30 * 60_000).toISOString());
    const deadline = new Date(booking.approvalDeadlineAt!);
    const accepted = await bookings.accept(owner.id, booking.id, new Date(deadline.getTime() - 1));
    expect(Date.parse(accepted.paymentDeadlineAt!)).toBeLessThanOrEqual(pickup.getTime());
  });

  it('starts the fifteen-minute checkout hold once without extending a shorter deadline', async () => {
    const car = await seedCar();
    const booking = await create(car.id);
    const first = bookingOf(
      await renter.agent.post(`${bookingUrl(booking.id)}/checkout`).expect(200),
    );
    expect(Date.parse(first.paymentDeadlineAt!) - Date.parse(first.checkoutStartedAt!)).toBe(
      15 * 60_000,
    );
    const repeated = bookingOf(
      await renter.agent.post(`${bookingUrl(booking.id)}/checkout`).expect(200),
    );
    expect(repeated.paymentDeadlineAt).toBe(first.paymentDeadlineAt);
    expect(repeated.checkoutStartedAt).toBe(first.checkoutStartedAt);
    expect(await queue.getJob(bookingJobId(BOOKING_JOBS.payment, booking.id))).toBeUndefined();
    expect((await queue.getJob(bookingJobId(BOOKING_JOBS.hold, booking.id)))?.name).toBe(
      BOOKING_JOBS.hold,
    );
    const secondCar = await seedCar();
    const second = await create(secondCar.id);
    const late = await bookings.beginCheckout(
      renter.id,
      second.id,
      new Date(Date.parse(second.paymentDeadlineAt!) - 2 * 60_000),
    );
    expect(late.paymentDeadlineAt).toBe(second.paymentDeadlineAt);
  });

  it('expires at the exact deadline, is idempotent, frees the calendar and commits expiry even when a late action fails', async () => {
    const car = await seedCar({ instantBook: false });
    const booking = await create(car.id);
    const deadline = new Date(booking.approvalDeadlineAt!);
    await expiry.expire(booking.id, new Date(deadline.getTime() - 1));
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'PENDING_APPROVAL',
    );
    await expect(bookings.accept(owner.id, booking.id, deadline)).rejects.toMatchObject({
      code: ErrorCode.BOOKING_EXPIRED,
    });
    await expiry.expire(booking.id, deadline);
    const cancelled = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelledBy).toBe('SYSTEM');
    expect(await prisma.bookingStatusLog.count({ where: { bookingId: booking.id } })).toBe(2);
    const instant = await seedCar();
    const active = await create(instant.id);
    await expiry.expire(active.id, new Date(active.paymentDeadlineAt!));
    expect((await create(instant.id)).status).toBe('AWAITING_PAYMENT');
  });

  it('expires a checkout hold and prevents stale jobs cancelling a confirmed booking', async () => {
    const car = await seedCar();
    const booking = await create(car.id);
    const checkout = await bookings.beginCheckout(renter.id, booking.id);
    await expiry.expire(booking.id, new Date(checkout.paymentDeadlineAt!));
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'CANCELLED',
    );
    const paid = await create(car.id);
    await prisma.$transaction((tx) =>
      state.transition(tx, paid.id, 'CONFIRMED', { role: 'SYSTEM', userId: null }, new Date()),
    );
    await expiry.expire(paid.id, later(2));
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe(
      'CONFIRMED',
    );
  });

  it.each(['accept', 'reject', 'checkout'] as const)(
    'uses the clock after acquiring the booking lock for %s at a deadline',
    async (action) => {
      const car = await seedCar({ instantBook: action === 'checkout' });
      const booking = await create(car.id);
      const deadline = new Date(
        action === 'checkout' ? booking.paymentDeadlineAt! : booking.approvalDeadlineAt!,
      );
      const lock = state.lock.bind(state);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(booking.createdAt));
      vi.spyOn(state, 'lock').mockImplementation(async (tx, id) => {
        const row = await lock(tx, id);
        // Models a request arriving before the deadline but obtaining its lock at expiry.
        vi.setSystemTime(deadline);
        return row;
      });
      try {
        const actions = {
          accept: () => bookings.accept(owner.id, booking.id),
          reject: () => bookings.reject(owner.id, booking.id),
          checkout: () => bookings.beginCheckout(renter.id, booking.id),
        };
        await expect(actions[action]()).rejects.toMatchObject({ code: ErrorCode.BOOKING_EXPIRED });
        expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
          'CANCELLED',
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('expires overdue reservations before creating a replacement and when listing/getting a trip', async () => {
    const car = await seedCar();
    const first = await create(car.id);
    await prisma.booking.update({
      where: { id: first.id },
      data: { paymentDeadlineAt: new Date(Date.now() - 1) },
    });
    const replacement = await create(car.id);
    expect(replacement.id).not.toBe(first.id);
    const list = bookingPageSchema.parse(
      (await renter.agent.get('/api/v1/bookings').query({ status: 'CANCELLED' }).expect(200)).body,
    );
    expect(list.items.map((item) => item.id)).toContain(first.id);
    await prisma.booking.update({
      where: { id: replacement.id },
      data: { paymentDeadlineAt: new Date(Date.now() - 1) },
    });
    expect(bookingOf(await renter.agent.get(bookingUrl(replacement.id)).expect(200)).status).toBe(
      'CANCELLED',
    );
  });

  it('recovers a failed queue publication from the transactional outbox without creating another booking', async () => {
    const car = await seedCar();
    vi.spyOn(jobs, 'schedule').mockRejectedValueOnce(new Error('simulated queue outage'));
    const booking = await create(car.id);
    expect(
      await prisma.bookingJobOutbox.count({ where: { bookingId: booking.id, action: 'SCHEDULE' } }),
    ).toBe(1);
    expect(booking.status).toBe('AWAITING_PAYMENT');
    await Promise.all([outbox.flushBooking(booking.id), outbox.flushBooking(booking.id)]);
    expect(await prisma.bookingJobOutbox.count({ where: { bookingId: booking.id } })).toBe(0);
    expect((await queue.getJob(bookingJobId(BOOKING_JOBS.payment, booking.id)))?.name).toBe(
      BOOKING_JOBS.payment,
    );
  });

  it('writes transition, log and queue intent atomically, rolls them all back, and rejects confirmation after payment expiry', async () => {
    const car = await seedCar({ instantBook: false });
    const booking = await create(car.id);
    await expect(
      prisma.$transaction(async (tx) => {
        await state.transition(
          tx,
          booking.id,
          'AWAITING_PAYMENT',
          { role: 'OWNER', userId: owner.id },
          new Date(),
          { paymentDeadlineAt: new Date(Date.now() + 30 * 60_000) },
        );
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe(
      'PENDING_APPROVAL',
    );
    expect(await prisma.bookingStatusLog.count({ where: { bookingId: booking.id } })).toBe(1);
    expect(await prisma.bookingJobOutbox.count({ where: { bookingId: booking.id } })).toBe(0);
    const approved = await bookings.accept(owner.id, booking.id);
    await expect(
      prisma.$transaction((tx) =>
        state.transition(
          tx,
          booking.id,
          'CONFIRMED',
          { role: 'SYSTEM', userId: null },
          new Date(approved.paymentDeadlineAt!),
        ),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.BOOKING_EXPIRED });
  });

  it('hides participant contacts and private pickup data before confirmation, then reveals the locked pickup snapshot', async () => {
    const car = await seedCar({
      deliveryEnabled: true,
      deliveryMaxRadiusKm: 10,
      deliveryFreeRadiusKm: 0,
      deliveryFeePerKm: 10_000,
    });
    const destination = {
      latitude: car.approxLatitude.toNumber(),
      longitude: car.approxLongitude.toNumber(),
    };
    const booking = await create(car.id, {
      pickupMethod: 'DELIVERY',
      deliveryAddress: 'Địa chỉ người thuê',
      deliveryLocation: destination,
    });
    expect(booking.delivery?.distanceKm).toBe(chargedKm(0));
    expect(booking.priceBreakdown.deliveryFee).toBe(0);
    expect(booking.delivery?.address).toBe('Địa chỉ người thuê');
    const before = bookingOf(await owner.agent.get(bookingUrl(booking.id)).expect(200));
    expect(before.delivery?.address).toBeNull();
    expect(before.delivery?.location).toBeNull();
    expect(before.renter.phone).toBeNull();
    await prisma.car.update({
      where: { id: car.id },
      data: { addressLine: 'Địa chỉ xe mới', latitude: 10.8 },
    });
    await prisma.$transaction((tx) =>
      state.transition(tx, booking.id, 'CONFIRMED', { role: 'SYSTEM', userId: null }, new Date()),
    );
    const after = bookingOf(await renter.agent.get(bookingUrl(booking.id)).expect(200));
    expect(after.car.licensePlate).toBe(car.licensePlate);
    expect(after.car.location.addressLine).toBe(car.addressLine);
    expect(after.car.location.latitude).toBe(car.latitude.toNumber());
    expect(after.owner.phone).toBe('0912345678');
    expect(after.priceBreakdown).toEqual(booking.priceBreakdown);
  });

  it('rejects self-rental, missing/unapproved/expired GPLX, incompatible classes and a GPLX expiring before return', async () => {
    const car = await seedCar();
    expect(
      errorOf(await owner.agent.post('/api/v1/bookings').send(input(car.id)).expect(422)).code,
    ).toBe(ErrorCode.BOOKING_SELF_RENTAL);
    await prisma.driverLicense.deleteMany({ where: { userId: renter.id } });
    expect(
      errorOf(await renter.agent.post('/api/v1/bookings').send(input(car.id)).expect(422)).code,
    ).toBe(ErrorCode.BOOKING_ELIGIBILITY_FAILED);
    await license(renter.id, { status: 'PENDING' });
    await renter.agent.post('/api/v1/bookings').send(input(car.id)).expect(422);
    await prisma.driverLicense.deleteMany({ where: { userId: renter.id } });
    await license(renter.id, { status: 'EXPIRED' });
    await renter.agent.post('/api/v1/bookings').send(input(car.id)).expect(422);
    await prisma.driverLicense.updateMany({
      where: { userId: renter.id },
      data: { status: 'APPROVED', licenseClass: 'LEGACY_B1' },
    });
    await prisma.car.update({ where: { id: car.id }, data: { transmission: 'MANUAL' } });
    await renter.agent.post('/api/v1/bookings').send(input(car.id)).expect(422);
    await prisma.car.update({
      where: { id: car.id },
      data: { transmission: 'AUTOMATIC', seats: 10 },
    });
    await renter.agent.post('/api/v1/bookings').send(input(car.id)).expect(422);
    await prisma.driverLicense.updateMany({
      where: { userId: renter.id },
      data: { licenseClass: 'D1', expiresOn: new Date('2026-01-01') },
    });
    await renter.agent.post('/api/v1/bookings').send(input(car.id)).expect(422);
    expect(await prisma.booking.count({ where: { carId: car.id } })).toBe(0);
  });

  it('requires verified email, correct participant ownership, valid times/terms and keeps owner/renter lists separate', async () => {
    const car = await seedCar({ instantBook: false });
    await request(app.getHttpServer()).post('/api/v1/bookings').send(input(car.id)).expect(401);
    expect(
      errorOf(await unverified.agent.post('/api/v1/bookings').send(input(car.id)).expect(403)).code,
    ).toBe(ErrorCode.EMAIL_NOT_VERIFIED);
    await renter.agent
      .post('/api/v1/bookings')
      .send(input(car.id, { termsAccepted: false }))
      .expect(400);
    await renter.agent
      .post('/api/v1/bookings')
      .send(input(car.id, { startAt: later(-100).toISOString() }))
      .expect(400);
    await renter.agent
      .post('/api/v1/bookings')
      .send(input(car.id, { startAt: later(0.25).toISOString() }))
      .expect(400);
    await renter.agent
      .post('/api/v1/bookings')
      .send(
        input(car.id, {
          startAt: later(100 * 24).toISOString(),
          endAt: later(101 * 24).toISOString(),
        }),
      )
      .expect(400);
    const booking = await create(car.id);
    await other.agent.get(bookingUrl(booking.id)).expect(404);
    await other.agent.post(ownerUrl(booking.id, 'accept')).expect(404);
    await other.agent.post(ownerUrl(booking.id, 'reject')).send({}).expect(404);
    await owner.agent.post(`${bookingUrl(booking.id)}/checkout`).expect(404);
    await renter.agent.post(`${bookingUrl(booking.id)}/checkout`).expect(409);
    const renterList = bookingPageSchema.parse(
      (await renter.agent.get('/api/v1/bookings').expect(200)).body,
    );
    const ownerList = bookingPageSchema.parse(
      (await owner.agent.get('/api/v1/owner/bookings').expect(200)).body,
    );
    expect(renterList.items.map((item) => item.id)).toEqual([booking.id]);
    expect(ownerList.items.map((item) => item.id)).toEqual([booking.id]);
    expect(
      bookingPageSchema.parse((await other.agent.get('/api/v1/bookings').expect(200)).body).items,
    ).toEqual([]);
    await renter.agent.get('/api/v1/bookings').query({ page: 0 }).expect(400);
  });

  it('keeps an approved GPLX usable during renewal and accepts expiry on the Vietnam return date', async () => {
    const car = await seedCar();
    await prisma.driverLicense.updateMany({
      where: { userId: renter.id },
      data: { expiresOn: fromDateOnly(vietnamDate(later(24))) },
    });
    await license(renter.id, { status: 'PENDING', licenseClass: 'LEGACY_B1' });
    expect((await create(car.id)).status).toBe('AWAITING_PAYMENT');
    const otherCar = await seedCar();
    await prisma.driverLicense.updateMany({
      where: { userId: other.id },
      data: { dateOfBirth: fromDateOnly(`${new Date().getUTCFullYear() - 10}-01-01`) },
    });
    expect(
      errorOf(await other.agent.post('/api/v1/bookings').send(input(otherCar.id)).expect(422)).code,
    ).toBe(ErrorCode.BOOKING_ELIGIBILITY_FAILED);
  });

  it('stores a valid rental larger than PostgreSQL Int without overflow', async () => {
    const car = await seedCar(
      {},
      {
        hourlyPrice: null,
        dailyPrice: null,
        monthlyPrice: 1_000_000_000,
        minDurationHours: 30 * 24,
        maxDurationDays: 180,
        lateFeePerHour: 100_000,
      },
    );
    const booking = await create(car.id, { endAt: later(180 * 24).toISOString() });
    expect(booking.priceBreakdown.rentalAmount).toBe(6_000_000_000);
    expect(
      (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).totalAmount,
    ).toBe(6_005_000_000n);
  });

  it('atomically cancels unpaid orders on account lock and preserves ongoing trips', async () => {
    const locked = await signUp('Tài Khoản Bị Khoá');
    await license(locked.id);
    const manualCar = await seedCar({ instantBook: false });
    const pending = await create(manualCar.id, {}, locked);
    const instantCar = await seedCar();
    const awaiting = await create(instantCar.id, {}, locked);
    const ongoingCar = await seedCar();
    const ongoing = await create(ongoingCar.id, {}, locked);
    await prisma.$transaction(async (tx) => {
      await state.transition(
        tx,
        ongoing.id,
        'CONFIRMED',
        { role: 'SYSTEM', userId: null },
        new Date(),
      );
      await state.transition(
        tx,
        ongoing.id,
        'IN_PROGRESS',
        { role: 'RENTER', userId: locked.id },
        new Date(),
      );
    });
    await app.get(ConsoleUsersService).lock(admin.id, locked.id, 'Khoá kiểm thử');
    const rows = await prisma.booking.findMany({
      where: { id: { in: [pending.id, awaiting.id, ongoing.id] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((row) => row.status)).toEqual(['CANCELLED', 'CANCELLED', 'IN_PROGRESS']);
    expect(rows[0]?.cancelledBy).toBe('ADMIN');
    expect(rows[1]?.cancelledBy).toBe('ADMIN');
    await locked.agent.get('/api/v1/bookings').expect(401);
  });
});
