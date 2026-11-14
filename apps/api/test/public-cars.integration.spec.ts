import { randomInt, randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  apiErrorSchema,
  authUserSchema,
  carSearchPageSchema,
  distanceKm,
  ErrorCode,
  maskLicensePlate,
  priceQuoteSchema,
  publicCarReviewPageSchema,
  publicCarSchema,
  publicProfileSchema,
  quoteRental,
  vietnamDate,
} from '@carenta/shared';

import { fromDateOnly, toDateOnly } from '../src/common/dates.js';
import { type BookingStatus, type Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

const HOUR = 3_600_000;
const errorOf = (response: request.Response) => apiErrorSchema.parse(response.body);
const carOf = (response: request.Response) => publicCarSchema.parse(response.body);
const quoteOf = (response: request.Response) => priceQuoteSchema.parse(response.body);
const carUrl = (id: string) => `/api/v1/cars/${id}`;
const randomPlate = () => {
  const digits = String(randomInt(0, 100_000)).padStart(5, '0');
  return `96S-${digits.slice(0, 3)}.${digits.slice(3)}`;
};

describe.runIf(process.env.INTEGRATION === '1')('public car detail and quotes', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ownerAgent: ReturnType<typeof request.agent>;
  let ownerId: string;
  let renterId: string;
  let makeId: number;
  let modelId: number;
  const tag = randomUUID().slice(0, 8);
  const province = `Public ${tag}`;
  const amenityIds: number[] = [];
  const userIds: string[] = [];
  const holidayIds: number[] = [];
  const start = new Date(Math.ceil((Date.now() + 48 * HOUR) / HOUR) * HOUR);
  const later = (hours: number) => new Date(start.getTime() + hours * HOUR);
  const trip = (from = 0, to = 24) => ({
    startAt: later(from).toISOString(),
    endAt: later(to).toISOString(),
    pickupMethod: 'SELF_PICKUP',
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    ownerAgent = request.agent(app.getHttpServer());
    const response = await ownerAgent
      .post('/api/v1/auth/register')
      .send({
        email: `public-owner-${tag}@example.com`,
        password: 'mat khau',
        fullName: 'Chủ Xe Công Khai',
      })
      .expect(201);
    ownerId = authUserSchema.parse(response.body).id;
    userIds.push(ownerId);
    await prisma.user.update({
      where: { id: ownerId },
      data: { phone: '0912345678', avatarKey: `avatars/${tag}.webp` },
    });
    const renter = await prisma.user.create({
      data: {
        email: `public-renter-${tag}@example.com`,
        passwordHash: 'unused',
        fullName: 'Người Thuê',
        phone: '0987654321',
      },
    });
    renterId = renter.id;
    userIds.push(renterId);
    const make = await prisma.carMake.create({
      data: {
        name: `Public ${tag}`,
        slug: `public-${tag}`,
        models: { create: { name: 'Alpha', slug: 'alpha' } },
      },
      include: { models: true },
    });
    makeId = make.id;
    modelId = make.models[0]!.id;
    const amenities = await Promise.all(
      [2, 1].map((order) =>
        prisma.amenity.create({
          data: { name: `Tiện nghi ${order}`, code: `PUBLIC_${tag}_${order}`, sortOrder: order },
        }),
      ),
    );
    amenityIds.push(...amenities.map((item) => item.id));
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({ where: { car: { ownerId } } });
    await prisma.car.deleteMany({ where: { ownerId } });
    await prisma.user.update({ where: { id: ownerId }, data: { status: 'ACTIVE' } });
    await prisma.holiday.deleteMany({ where: { id: { in: holidayIds } } });
    holidayIds.length = 0;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.carModel.deleteMany({ where: { makeId } });
    await prisma.carMake.delete({ where: { id: makeId } });
    await prisma.amenity.deleteMany({ where: { id: { in: amenityIds } } });
    await app.close();
  });

  async function seedCar(overrides: Partial<Prisma.CarUncheckedCreateInput> = {}) {
    return prisma.car.create({
      data: {
        ownerId,
        modelId,
        year: 2022,
        licensePlate: randomPlate(),
        color: 'Trắng',
        bodyType: 'SEDAN',
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'GASOLINE',
        fuelConsumption: 6.5,
        odometerKm: 20_000,
        description: 'Xe gia đình',
        province,
        ward: 'Phường Bến Thành',
        addressLine: `Địa chỉ riêng ${tag}`,
        latitude: 10.77,
        longitude: 106.7,
        status: 'ACTIVE',
        reviewedAt: new Date(),
        dailyKmLimit: 250,
        extraKmFee: 3_000,
        depositAmount: 5_000_000,
        bufferMinutes: 120,
        deliveryEnabled: true,
        deliveryMaxRadiusKm: overrides.deliveryEnabled === false ? null : 10,
        deliveryFreeRadiusKm: overrides.deliveryEnabled === false ? null : 0,
        deliveryFeePerKm: overrides.deliveryEnabled === false ? null : 10_000,
        ...overrides,
        pricing: {
          create: {
            hourlyPrice: 80_000,
            dailyPrice: 800_000,
            monthlyPrice: 18_000_000,
            minDurationHours: 1,
            maxDurationDays: 30,
            weekendSurchargePercent: 20,
            holidaySurchargePercent: 30,
            longRentalDiscountPercent: 10,
          },
        },
        photos: {
          create: [3, 1, 0, 2].map((position) => ({
            position,
            fileKey: `cars/${tag}/${position}.webp`,
          })),
        },
        amenities: { create: amenityIds.map((amenityId) => ({ amenityId })) },
      },
      include: { pricing: true },
    });
  }

  function seedBooking(carId: string, status: BookingStatus, from = 0, to = 24, bufferHours = 2) {
    return prisma.booking.create({
      data: {
        carId,
        ownerId,
        renterId,
        status,
        startAt: later(from),
        endAt: later(to),
        blockedUntil: later(to + bufferHours),
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

  async function expectedQuote(
    car: Awaited<ReturnType<typeof seedCar>>,
    input = trip(),
    deliveryDistanceKm: number | null = null,
  ) {
    const holidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: fromDateOnly(vietnamDate(new Date(input.startAt))),
          lte: fromDateOnly(vietnamDate(new Date(input.endAt))),
        },
      },
    });
    const result = quoteRental({
      pricing: car.pricing!,
      depositAmount: car.depositAmount,
      delivery: car.deliveryEnabled
        ? {
            maxRadiusKm: car.deliveryMaxRadiusKm!,
            freeRadiusKm: car.deliveryFreeRadiusKm!,
            feePerKm: car.deliveryFeePerKm!,
          }
        : null,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      holidays: holidays.map((holiday) => toDateOnly(holiday.date)),
      deliveryDistanceKm,
    });
    if (!result.ok) throw new Error(result.message);
    return result.quote;
  }

  it('returns public fields, ordered photos and amenities, and reuses the public owner profile without private metadata', async () => {
    const car = await seedCar();
    await prisma.carDocument.create({
      data: { carId: car.id, type: 'REGISTRATION', fileKey: `private/${tag}.jpg` },
    });
    await prisma.carRevision.create({
      data: { carId: car.id, year: 2025, licensePlate: '50LD-999.99' },
    });
    const response = await request(app.getHttpServer()).get(carUrl(car.id)).expect(200);
    const detail = carOf(response);
    expect(detail.licensePlate).toBe(maskLicensePlate(car.licensePlate));
    expect(detail.year).toBe(2022);
    expect(detail.photos.map((photo) => photo.position)).toEqual([0, 1, 2, 3]);
    expect(detail.amenities.map((item) => item.name)).toEqual(['Tiện nghi 1', 'Tiện nghi 2']);
    expect(detail.pricing.effectiveLateFeePerHour).toBe(80_000);
    expect(detail.pricing.dailyEquivalentPrice).toBe(800_000);
    expect(detail.mileageLimit).toEqual({ dailyKm: 250, extraFeePerKm: 3_000 });
    expect(detail.delivery).toEqual({ maxRadiusKm: 10, freeRadiusKm: 0, feePerKm: 10_000 });
    expect(detail.rating).toEqual({ average: null, count: 0 });
    expect(detail.reviews).toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
    const profile = publicProfileSchema.parse(
      (await request(app.getHttpServer()).get(`/api/v1/users/${ownerId}`).expect(200)).body,
    );
    expect(detail.owner).toEqual(profile);
    const search = carSearchPageSchema.parse(
      (await request(app.getHttpServer()).get('/api/v1/cars').query({ province }).expect(200)).body,
    );
    expect(detail.location).toEqual(search.items.find((item) => item.id === car.id)?.location);
    expect(detail.location.latitude).toBe(car.approxLatitude.toNumber());
    expect(detail.location.latitude).not.toBe(car.latitude.toNumber());
    for (const key of [
      'documents',
      'revision',
      'revisions',
      'rejectionReason',
      'ownerId',
      'addressLine',
      'avatarKey',
      'email',
      'phone',
    ]) {
      expect(JSON.stringify(response.body)).not.toContain(`"${key}"`);
    }
    for (const value of [
      car.licensePlate,
      car.addressLine,
      '50LD-999.99',
      `private/${tag}.jpg`,
      '0912345678',
    ]) {
      expect(JSON.stringify(response.body)).not.toContain(value);
    }
    expect(carOf(await ownerAgent.get(carUrl(car.id)).expect(200))).toEqual(detail);
  });

  it.each(['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'PAUSED', 'HIDDEN', 'REMOVED'] as const)(
    'does not expose detail, reviews or quotes of %s cars, even to their owner',
    async (status) => {
      const car = await seedCar({ status });
      const responses = await Promise.all([
        request(app.getHttpServer()).get(carUrl(car.id)).expect(404),
        ownerAgent.get(carUrl(car.id)).expect(404),
        request(app.getHttpServer())
          .get(`${carUrl(car.id)}/reviews`)
          .expect(404),
        request(app.getHttpServer())
          .post(`${carUrl(car.id)}/quote`)
          .send(trip())
          .expect(404),
      ]);
      expect(responses.map(errorOf).every((error) => error.code === ErrorCode.NOT_FOUND)).toBe(
        true,
      );
    },
  );

  it('hides temporarily hidden cars and locked owners, and handles unknown cars', async () => {
    const car = await seedCar({ hiddenUntil: new Date(Date.now() + HOUR) });
    expect(
      errorOf(
        await request(app.getHttpServer())
          .post(`${carUrl(car.id)}/quote`)
          .send(trip())
          .expect(404),
      ).code,
    ).toBe(ErrorCode.NOT_FOUND);
    await prisma.car.update({
      where: { id: car.id },
      data: { hiddenUntil: new Date(Date.now() - HOUR) },
    });
    await request(app.getHttpServer()).get(carUrl(car.id)).expect(200);
    await prisma.user.update({ where: { id: ownerId }, data: { status: 'LOCKED' } });
    await request(app.getHttpServer()).get(carUrl(car.id)).expect(404);
    await request(app.getHttpServer())
      .get(`${carUrl(car.id)}/reviews`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${carUrl(car.id)}/quote`)
      .send(trip())
      .expect(404);
    await request(app.getHttpServer()).get(carUrl(randomUUID())).expect(404);
  });

  it("publishes only this car's renter reviews, calculates matching rating/trip count, and paginates in stable order", async () => {
    const car = await seedCar();
    const otherCar = await seedCar();
    const bookings = await Promise.all(
      [0, 1, 2, 3].map((offset) =>
        seedBooking(car.id, 'COMPLETED', -200 - offset * 30, -176 - offset * 30),
      ),
    );
    const [older, newer] = await Promise.all(
      [4, 5].map((rating, index) =>
        prisma.review.create({
          data: {
            bookingId: bookings[index]!.id,
            direction: 'RENTER_TO_OWNER',
            authorId: renterId,
            subjectUserId: ownerId,
            rating,
            comment: `Đánh giá ${rating}`,
            publishedAt: later(-10 + index),
          },
        }),
      ),
    );
    await prisma.review.create({
      data: {
        bookingId: bookings[2]!.id,
        direction: 'RENTER_TO_OWNER',
        authorId: renterId,
        subjectUserId: ownerId,
        rating: 1,
        comment: 'Chưa công bố',
      },
    });
    await prisma.review.create({
      data: {
        bookingId: bookings[0]!.id,
        direction: 'OWNER_TO_RENTER',
        authorId: ownerId,
        subjectUserId: renterId,
        rating: 1,
        publishedAt: later(-8),
      },
    });
    const otherBooking = await seedBooking(otherCar.id, 'COMPLETED', -400, -376);
    await prisma.review.create({
      data: {
        bookingId: otherBooking.id,
        direction: 'RENTER_TO_OWNER',
        authorId: renterId,
        subjectUserId: ownerId,
        rating: 1,
        publishedAt: later(-7),
      },
    });
    const answered = await seedBooking(car.id, 'CANCELLED', -500, -476);
    const expired = await seedBooking(car.id, 'CANCELLED', -600, -576);
    await prisma.bookingStatusLog.createMany({
      data: [
        {
          bookingId: answered.id,
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'CANCELLED',
          actorRole: 'OWNER',
        },
        {
          bookingId: expired.id,
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'CANCELLED',
          actorRole: 'SYSTEM',
        },
      ],
    });
    const detail = carOf(await request(app.getHttpServer()).get(carUrl(car.id)).expect(200));
    expect(detail.rating).toEqual({ average: 4.5, count: 2 });
    expect(detail.tripCount).toBe(4);
    expect(detail.owner.responseRate).toBe(50);
    expect(detail.reviews.items.map((item) => item.id)).toEqual([newer!.id, older!.id]);
    const firstResponse = await request(app.getHttpServer())
      .get(`${carUrl(car.id)}/reviews`)
      .query({ pageSize: 1 })
      .expect(200);
    const first = publicCarReviewPageSchema.parse(firstResponse.body);
    const second = publicCarReviewPageSchema.parse(
      (
        await request(app.getHttpServer())
          .get(`${carUrl(car.id)}/reviews`)
          .query({ page: 2, pageSize: 1 })
          .expect(200)
      ).body,
    );
    expect(first.items.map((item) => item.id)).toEqual([newer!.id]);
    expect(second.items.map((item) => item.id)).toEqual([older!.id]);
    expect(first.total).toBe(2);
    expect(JSON.stringify(firstResponse.body)).not.toMatch(/bookingId|phone|email|subjectUserId/);
    expect(
      publicCarReviewPageSchema.parse(
        (
          await request(app.getHttpServer())
            .get(`${carUrl(car.id)}/reviews`)
            .query({ page: 3, pageSize: 1 })
            .expect(200)
        ).body,
      ).items,
    ).toEqual([]);
  });

  it('prices anonymous pickup with server settings, ignores client amounts, and creates no calendar hold', async () => {
    const car = await seedCar({ deliveryEnabled: false });
    const response = await request(app.getHttpServer())
      .post(`${carUrl(car.id)}/quote`)
      .send({
        ...trip(),
        totalAmount: 1,
        rentalAmount: 1,
        depositAmount: 0,
        deliveryDistanceKm: 0,
        pricing: { dailyPrice: 1 },
      })
      .expect(200);
    expect(quoteOf(response)).toEqual(await expectedQuote(car));
    expect(quoteOf(response).depositAmount).toBe(5_000_000);
    expect(quoteOf(response).deliveryFee).toBe(0);
    expect(await prisma.booking.count({ where: { carId: car.id } })).toBe(0);
    expect(await prisma.availabilityBlock.count({ where: { carId: car.id } })).toBe(0);
    await prisma.carPricing.update({ where: { carId: car.id }, data: { dailyPrice: 900_000 } });
    const updated = quoteOf(
      await request(app.getHttpServer())
        .post(`${carUrl(car.id)}/quote`)
        .send(trip())
        .expect(200),
    );
    expect(updated.rentalAmount).toBeGreaterThan(quoteOf(response).rentalAmount);
  });

  it('uses Vietnam holiday dates and the pure pricing function for holiday/weekend surcharges and long-rental discounts', async () => {
    const car = await seedCar();
    const holidays = await prisma.holiday.findMany({ select: { date: true } });
    const existing = new Set(holidays.map((holiday) => toDateOnly(holiday.date)));
    const days = Array.from(
      { length: 20 },
      (_, index) => new Date(start.getTime() + (index + 3) * 24 * HOUR),
    );
    const freeDay = days.find((date) => !existing.has(vietnamDate(date)))!;
    const date = vietnamDate(freeDay);
    const holiday = await prisma.holiday.create({
      data: { date: fromDateOnly(date), name: `Public ${tag}` },
    });
    holidayIds.push(holiday.id);
    // Starts just before midnight in Vietnam, still on the previous UTC date.
    const startAt = new Date(new Date(`${date}T00:00:00+07:00`).getTime() - HOUR);
    const input = {
      startAt: startAt.toISOString(),
      endAt: new Date(startAt.getTime() + 8 * 24 * HOUR).toISOString(),
      pickupMethod: 'SELF_PICKUP',
    };
    const quoted = quoteOf(
      await request(app.getHttpServer())
        .post(`${carUrl(car.id)}/quote`)
        .send(input)
        .expect(200),
    );
    expect(quoted).toEqual(await expectedQuote(car, input));
    expect(quoted.lines.some((line) => line.code === 'HOLIDAY_SURCHARGE')).toBe(true);
    expect(quoted.lines.some((line) => line.code === 'LONG_RENTAL_DISCOUNT')).toBe(true);
  });

  it('uses the fixed public point for delivery pricing and range checks, never the exact coordinates', async () => {
    const car = await seedCar();
    const origin = {
      latitude: car.approxLatitude.toNumber(),
      longitude: car.approxLongitude.toNumber(),
    };
    expect(
      distanceKm(origin, {
        latitude: car.latitude.toNumber(),
        longitude: car.longitude.toNumber(),
      }),
    ).toBeGreaterThan(0.19);
    const url = `${carUrl(car.id)}/quote`;
    const zero = quoteOf(
      await request(app.getHttpServer())
        .post(url)
        .send({ ...trip(), pickupMethod: 'DELIVERY', deliveryLocation: origin })
        .expect(200),
    );
    expect(zero.deliveryFee).toBe(0);
    expect(zero).toEqual(await expectedQuote(car, trip(), 0));
    const destination = { latitude: origin.latitude + 0.025, longitude: origin.longitude };
    const quoted = quoteOf(
      await request(app.getHttpServer())
        .post(url)
        .send({
          ...trip(),
          pickupMethod: 'DELIVERY',
          deliveryLocation: destination,
          deliveryDistanceKm: 0,
        })
        .expect(200),
    );
    expect(quoted).toEqual(await expectedQuote(car, trip(), distanceKm(origin, destination)));
    expect(quoted.deliveryFee).toBe(30_000);
    const far = await request(app.getHttpServer())
      .post(url)
      .send({
        ...trip(),
        pickupMethod: 'DELIVERY',
        deliveryLocation: { ...origin, latitude: origin.latitude + 0.1 },
      })
      .expect(422);
    expect(errorOf(far).code).toBe(ErrorCode.DELIVERY_TOO_FAR);
  });

  it('reports delivery unavailable and car-specific rental length limits with business error codes', async () => {
    const car = await seedCar({ deliveryEnabled: false });
    const url = `${carUrl(car.id)}/quote`;
    const noDelivery = await request(app.getHttpServer())
      .post(url)
      .send({
        ...trip(),
        pickupMethod: 'DELIVERY',
        deliveryLocation: { latitude: 10.77, longitude: 106.7 },
      })
      .expect(422);
    expect(errorOf(noDelivery).code).toBe(ErrorCode.DELIVERY_UNAVAILABLE);
    expect(
      errorOf(await request(app.getHttpServer()).post(url).send(trip(0, 0.5)).expect(422)).code,
    ).toBe(ErrorCode.RENTAL_TOO_SHORT);
    expect(
      errorOf(
        await request(app.getHttpServer())
          .post(url)
          .send(trip(0, 31 * 24))
          .expect(422),
      ).code,
    ).toBe(ErrorCode.RENTAL_TOO_LONG);
  });

  it.each(['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] as const)(
    'refuses a quote overlapping %s and preserves the snapshotted buffer',
    async (status) => {
      const car = await seedCar({ bufferMinutes: 0 });
      await seedBooking(car.id, status, 0, 24, 4);
      const response = await request(app.getHttpServer())
        .post(`${carUrl(car.id)}/quote`)
        .send(trip(26, 27))
        .expect(409);
      expect(errorOf(response).code).toBe(ErrorCode.CAR_UNAVAILABLE);
      expect(response.body).not.toHaveProperty('totalAmount');
      await request(app.getHttpServer())
        .post(`${carUrl(car.id)}/quote`)
        .send(trip(28, 29))
        .expect(200);
    },
  );

  it.each(['PENDING_APPROVAL', 'RETURNED', 'COMPLETED', 'CANCELLED', 'DISPUTED'] as const)(
    'does not let %s block a quote',
    async (status) => {
      const car = await seedCar();
      await seedBooking(car.id, status);
      expect(
        quoteOf(
          await request(app.getHttpServer())
            .post(`${carUrl(car.id)}/quote`)
            .send(trip())
            .expect(200),
        ),
      ).toEqual(await expectedQuote(car));
    },
  );

  it('checks the new trip buffer before a booking and only the trip range against manual blocks', async () => {
    const car = await seedCar();
    await seedBooking(car.id, 'CONFIRMED', 24, 48);
    expect(
      errorOf(
        await request(app.getHttpServer())
          .post(`${carUrl(car.id)}/quote`)
          .send(trip(0, 23))
          .expect(409),
      ).code,
    ).toBe(ErrorCode.CAR_UNAVAILABLE);
    await request(app.getHttpServer())
      .post(`${carUrl(car.id)}/quote`)
      .send(trip(0, 22))
      .expect(200);
    await prisma.availabilityBlock.create({
      data: { carId: car.id, startAt: later(12), endAt: later(14), reason: 'Riêng tư' },
    });
    await request(app.getHttpServer())
      .post(`${carUrl(car.id)}/quote`)
      .send(trip(0, 12))
      .expect(200);
    const blocked = await request(app.getHttpServer())
      .post(`${carUrl(car.id)}/quote`)
      .send(trip(11, 13))
      .expect(409);
    expect(errorOf(blocked).code).toBe(ErrorCode.CAR_UNAVAILABLE);
    expect(JSON.stringify(blocked.body)).not.toContain('Riêng tư');
    await request(app.getHttpServer())
      .post(`${carUrl(car.id)}/quote`)
      .send(trip(14, 15))
      .expect(200);
  });

  it('validates ids, pagination, malformed dates, delivery coordinates and booking time windows over HTTP', async () => {
    const car = await seedCar();
    const url = `${carUrl(car.id)}/quote`;
    const invalid = await request(app.getHttpServer())
      .post(url)
      .send({ ...trip(), startAt: 'invalid' })
      .expect(400);
    expect(errorOf(invalid).code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(errorOf(invalid).details?.some((item) => item.path === 'startAt')).toBe(true);
    await request(app.getHttpServer())
      .post(url)
      .send({ ...trip(), pickupMethod: 'DELIVERY' })
      .expect(400);
    await request(app.getHttpServer())
      .post(url)
      .send({
        ...trip(),
        pickupMethod: 'DELIVERY',
        deliveryLocation: { latitude: 0, longitude: 0 },
      })
      .expect(400);
    await request(app.getHttpServer()).post(url).send(trip(0.25, 24)).expect(400);
    await request(app.getHttpServer()).post(url).send(trip(0, 0)).expect(400);
    await request(app.getHttpServer())
      .post(url)
      .send({ ...trip(), startAt: new Date(Math.ceil(Date.now() / HOUR) * HOUR).toISOString() })
      .expect(400);
    await request(app.getHttpServer())
      .post(url)
      .send(trip(100 * 24, 101 * 24))
      .expect(400);
    await request(app.getHttpServer()).get(carUrl('invalid')).expect(400);
    await request(app.getHttpServer())
      .get(`${carUrl(car.id)}/reviews`)
      .query({ page: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .get(`${carUrl(car.id)}/reviews`)
      .query({ pageSize: 101 })
      .expect(400);
  });
});
