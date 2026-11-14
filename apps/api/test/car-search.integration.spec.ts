import { randomInt, randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import {
  apiErrorSchema,
  carSearchPageSchema,
  distanceKm,
  ErrorCode,
  quoteRental,
} from '@carenta/shared';

import { type BookingStatus, type CarStatus, type Prisma } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

const HOUR = 60 * 60 * 1000;

const idsOf = (page: { items: { id: string }[] }) => page.items.map((item) => item.id);

/** A normalised plate no other test run is likely to hold: 98S-xxx.xx */
const randomPlate = () => {
  const digits = String(randomInt(0, 100_000)).padStart(5, '0');
  return `98S-${digits.slice(0, 3)}.${digits.slice(3)}`;
};

/**
 * Public car search over HTTP against Postgres (spec §5.1). Cars, bookings and reviews are
 * seeded straight into the database in a province of their own, so other data in the
 * database never shows up. Run with INTEGRATION=1.
 */
describe.runIf(process.env.INTEGRATION === '1')('car search', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tag = randomUUID().slice(0, 8);
  const province = `Tỉnh Kiểm Thử ${tag}`;
  // Somewhere in the Mekong delta, moved a little per run.
  const base = { latitude: 9.8 + randomInt(0, 1000) / 10_000, longitude: 105.6 };
  const userIds: string[] = [];
  const makeIds: number[] = [];
  const amenityIds: number[] = [];
  let modelId: number;
  let otherMakeModelId: number;
  let otherMakeId: number;
  let ownerId: string;
  let renterId: string;

  /** Pickup two days from now on a whole hour, so it passes the booking window. */
  const tripStart = (() => {
    const start = new Date(Date.now() + 48 * HOUR);
    start.setUTCMinutes(0, 0, 0);
    return start;
  })();
  const later = (hours: number) => new Date(tripStart.getTime() + hours * HOUR);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const [make, otherMake] = await Promise.all(
      ['A', 'B'].map((suffix) =>
        prisma.carMake.create({
          data: {
            name: `Search ${tag} ${suffix}`,
            slug: `search-${tag}-${suffix.toLowerCase()}`,
            models: { create: [{ name: 'Alpha', slug: 'alpha' }] },
          },
          include: { models: true },
        }),
      ),
    );
    makeIds.push(make!.id, otherMake!.id);
    modelId = make!.models[0]!.id;
    otherMakeId = otherMake!.id;
    otherMakeModelId = otherMake!.models[0]!.id;
    const amenities = await Promise.all(
      ['A', 'B'].map((suffix) =>
        prisma.amenity.create({
          data: { code: `SEARCH_${tag}_${suffix}`, name: `Tiện nghi ${suffix}` },
        }),
      ),
    );
    amenityIds.push(...amenities.map((a) => a.id));
    ownerId = await createUser('Chủ Xe');
    renterId = await createUser('Người Thuê');
  });

  afterEach(async () => {
    const cars = { car: { ownerId: { in: userIds } } };
    await prisma.booking.deleteMany({ where: cars });
    await prisma.car.deleteMany({ where: { ownerId: { in: userIds } } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.carModel.deleteMany({ where: { makeId: { in: makeIds } } });
    await prisma.carMake.deleteMany({ where: { id: { in: makeIds } } });
    await prisma.amenity.deleteMany({ where: { id: { in: amenityIds } } });
    await app.close();
  });

  async function createUser(fullName: string) {
    const user = await prisma.user.create({
      data: {
        email: `search-${randomUUID()}@example.com`,
        passwordHash: 'not used',
        fullName,
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  type Pricing = Omit<Prisma.CarPricingCreateWithoutCarInput, 'dailyEquivalentPrice'>;

  /** A listed car near `base`, priced 800.000đ a day unless told otherwise. */
  async function seedCar(
    overrides: Partial<Prisma.CarUncheckedCreateInput> & { amenities?: number[] } = {},
    pricing: Partial<Pricing> = {},
  ) {
    const { amenities = [], ...car } = overrides;
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
        odometerKm: 20_000,
        province,
        ward: 'Phường Ninh Kiều',
        addressLine: '1 Hai Bà Trưng',
        latitude: base.latitude,
        longitude: base.longitude,
        status: 'ACTIVE' satisfies CarStatus,
        reviewedAt: new Date(),
        ...car,
        pricing: {
          create: {
            hourlyPrice: null,
            dailyPrice: 800_000,
            monthlyPrice: null,
            minDurationHours: 24,
            maxDurationDays: 30,
            ...pricing,
          },
        },
        photos: { create: [{ fileKey: `cars/${randomUUID()}`, position: 0 }] },
        amenities: { create: amenities.map((amenityId) => ({ amenityId })) },
      },
      include: { pricing: true },
    });
  }

  async function seedBooking(
    carId: string,
    status: BookingStatus,
    startAt: Date,
    endAt: Date,
    bufferMinutes = 120,
  ) {
    return prisma.booking.create({
      data: {
        carId,
        renterId,
        ownerId,
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

  /** A completed trip with the renter's review of the car. */
  async function seedReview(carId: string, rating: number, published = true) {
    const booking = await seedBooking(carId, 'COMPLETED', later(-200), later(-176));
    await prisma.review.create({
      data: {
        bookingId: booking.id,
        direction: 'RENTER_TO_OWNER',
        authorId: renterId,
        subjectUserId: ownerId,
        rating,
        publishedAt: published ? new Date() : null,
      },
    });
  }

  async function search(query: Record<string, string | number | boolean | string[]> = {}) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/cars')
      .query({ province, ...query })
      .expect(200);
    return carSearchPageSchema.parse(res.body);
  }
  const trip = (startHours: number, endHours: number) => ({
    startAt: later(startHours).toISOString(),
    endAt: later(endHours).toISOString(),
  });

  it('lists only cars that are listed, by a public car', async () => {
    const listed = await seedCar();
    const pastHidden = await seedCar({ hiddenUntil: new Date(Date.now() - HOUR) });
    await Promise.all([
      ...(['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'PAUSED', 'HIDDEN', 'REMOVED'] as const).map(
        (status) => seedCar({ status }),
      ),
      // Hidden for 7 days after too many owner cancellations
      seedCar({ hiddenUntil: new Date(Date.now() + HOUR) }),
    ]);
    const lockedOwner = await createUser('Bị Khoá');
    await prisma.user.update({ where: { id: lockedOwner }, data: { status: 'LOCKED' } });
    await seedCar({ ownerId: lockedOwner });

    const page = await search();
    expect(idsOf(page).toSorted()).toEqual([listed.id, pastHidden.id].toSorted());
    expect(page.total).toBe(2);
  });

  it('shows an approximate position and never the plate', async () => {
    const car = await seedCar();
    const res = await request(app.getHttpServer())
      .get('/api/v1/cars')
      .query({ province })
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain(car.licensePlate);
    expect(JSON.stringify(res.body)).not.toContain('Hai Bà Trưng');

    const [item] = carSearchPageSchema.parse(res.body).items;
    expect(item).toMatchObject({
      id: car.id,
      location: { province, ward: 'Phường Ninh Kiều', radiusMeters: 1000 },
      deliveryAvailable: false,
      estimate: null,
      distanceKm: null,
      rating: { average: null, count: 0 },
      tripCount: 0,
    });
    expect(item?.coverPhoto?.sm).toMatch(/^http/);
    const offsetKm = distanceKm(base, item!.location);
    expect(offsetKm).toBeGreaterThanOrEqual(0.199);
    expect(offsetKm).toBeLessThanOrEqual(1);

    // The same offset every time, so averaging requests reveals nothing.
    const again = await search();
    expect(again.items[0]!.location).toEqual(item!.location);
  });

  it('prices every car by its daily equivalent', async () => {
    const daily = await seedCar({}, { hourlyPrice: 20_000, dailyPrice: 800_000 });
    const hourly = await seedCar(
      {},
      { hourlyPrice: 30_000, dailyPrice: null, minDurationHours: 4, lateFeePerHour: 50_000 },
    );
    const monthly = await seedCar(
      {},
      {
        dailyPrice: null,
        monthlyPrice: 10_000_000,
        minDurationHours: 720,
        maxDurationDays: 60,
        lateFeePerHour: 50_000,
      },
    );
    const both = await seedCar(
      {},
      { hourlyPrice: 20_000, dailyPrice: null, monthlyPrice: 12_000_000, lateFeePerHour: 50_000 },
    );

    const page = await search({ sort: 'price_asc' });
    const priceOf = (id: string) =>
      page.items.find((item) => item.id === id)?.prices.dailyEquivalentPrice;
    expect(priceOf(daily.id)).toBe(800_000);
    expect(priceOf(hourly.id)).toBe(720_000);
    // 10.000.000 ÷ 30 = 333.333 → 333.000
    expect(priceOf(monthly.id)).toBe(333_000);
    expect(priceOf(both.id)).toBe(400_000);
    expect(idsOf(page)).toEqual([monthly.id, both.id, hourly.id, daily.id]);

    const desc = await search({ sort: 'price_desc' });
    expect(idsOf(desc)).toEqual([daily.id, hourly.id, both.id, monthly.id]);

    const range = await search({ minPrice: 400_000, maxPrice: 720_000, sort: 'price_asc' });
    expect(idsOf(range)).toEqual([both.id, hourly.id]);
  });

  it('filters by car details and amenities', async () => {
    const amenityA = amenityIds[0]!;
    const amenityB = amenityIds[1]!;
    const suv = await seedCar({
      bodyType: 'SUV',
      seats: 7,
      transmission: 'MANUAL',
      fuelType: 'DIESEL',
      instantBook: true,
      amenities: [amenityA, amenityB],
    });
    const electric = await seedCar({
      modelId: otherMakeModelId,
      fuelType: 'ELECTRIC',
      ward: 'Phường Cái Khế',
      deliveryEnabled: true,
      deliveryMaxRadiusKm: 10,
      deliveryFeePerKm: 10_000,
      deliveryFreeRadiusKm: 2,
      amenities: [amenityA],
    });
    const plain = await seedCar();

    expect(idsOf(await search({ bodyTypes: 'SUV,MPV' }))).toEqual([suv.id]);
    expect(idsOf(await search({ seatsMin: 6 }))).toEqual([suv.id]);
    expect(idsOf(await search({ seatsMax: 5, sort: 'price_asc' })).toSorted()).toEqual(
      [electric.id, plain.id].toSorted(),
    );
    expect(idsOf(await search({ transmissions: 'MANUAL' }))).toEqual([suv.id]);
    expect(idsOf(await search({ fuelTypes: ['DIESEL', 'ELECTRIC'] })).toSorted()).toEqual(
      [suv.id, electric.id].toSorted(),
    );
    expect(idsOf(await search({ instantBook: true }))).toEqual([suv.id]);
    expect(idsOf(await search({ instantBook: false })).toSorted()).toEqual(
      [electric.id, plain.id].toSorted(),
    );
    expect(idsOf(await search({ delivery: true }))).toEqual([electric.id]);
    expect(idsOf(await search({ makeIds: String(otherMakeId) }))).toEqual([electric.id]);
    // Every amenity asked for, not any of them
    expect(idsOf(await search({ amenityIds: `${amenityA},${amenityB}` }))).toEqual([suv.id]);
    expect(idsOf(await search({ amenityIds: String(amenityA) })).toSorted()).toEqual(
      [suv.id, electric.id].toSorted(),
    );
    // Part of the name, any case
    expect(idsOf(await search({ ward: 'cái khế' }))).toEqual([electric.id]);
    const byProvince = await request(app.getHttpServer())
      .get('/api/v1/cars')
      .query({ province: `kiểm thử ${tag}`.toUpperCase() })
      .expect(200);
    expect(carSearchPageSchema.parse(byProvince.body).total).toBe(3);
    // LIKE wildcards are plain text
    expect((await search({ ward: '%' })).total).toBe(0);
  });

  it('searches around a point by approximate distance, nearest first', async () => {
    const near = await seedCar();
    // About 5.5 km north and 11 km north
    const mid = await seedCar({ latitude: base.latitude + 0.05 });
    const far = await seedCar({ latitude: base.latitude + 0.1 });
    const point = { lat: base.latitude, lng: base.longitude };

    const page = await search({ ...point, radiusKm: 8 });
    expect(idsOf(page)).toEqual([near.id, mid.id]);
    expect(page.items[0]!.distanceKm).toBeLessThanOrEqual(1);
    expect(page.items[1]!.distanceKm).toBeGreaterThan(4);

    const wide = await search({ ...point, radiusKm: 20 });
    expect(idsOf(wide)).toEqual([near.id, mid.id, far.id]);
    for (const item of wide.items) {
      // One decimal, from the approximate position
      const expected = distanceKm({ latitude: point.lat, longitude: point.lng }, item.location);
      expect(Math.abs(item.distanceKm! - expected)).toBeLessThanOrEqual(0.051);
    }
    // Default radius is 10 km
    expect(idsOf(await search(point))).toEqual([near.id, mid.id]);
  });

  it('with times, returns only free cars that allow the trip length, with an estimate', async () => {
    const free = await seedCar(
      {},
      {
        hourlyPrice: 100_000,
        dailyPrice: 800_000,
        minDurationHours: 4,
        weekendSurchargePercent: 20,
      },
    );
    const blocked = await seedCar();
    await prisma.availabilityBlock.create({
      data: { carId: blocked.id, startAt: later(10), endAt: later(12) },
    });
    const booked = await seedCar();
    await seedBooking(booked.id, 'CONFIRMED', later(-24), later(1));
    // A request waiting for the owner does not hold the calendar (spec §4.3).
    const requested = await seedCar();
    await seedBooking(requested.id, 'PENDING_APPROVAL', later(0), later(24));
    const cancelled = await seedCar();
    await seedBooking(cancelled.id, 'CANCELLED', later(0), later(24));
    const tooShort = await seedCar({}, { minDurationHours: 72 });
    const tooLong = await seedCar({}, { maxDurationDays: 1 });

    const page = await search({ ...trip(0, 48), sort: 'price_asc' });
    expect(idsOf(page).toSorted()).toEqual([free.id, requested.id, cancelled.id].toSorted());

    const item = page.items.find((i) => i.id === free.id)!;
    const quote = quoteRental({
      pricing: free.pricing!,
      depositAmount: free.depositAmount,
      delivery: null,
      startAt: tripStart,
      endAt: later(48),
      holidays: [],
      deliveryDistanceKm: null,
    });
    if (!quote.ok) throw new Error(quote.message);
    expect(item.estimate).toEqual({
      durationMinutes: 48 * 60,
      rentalAmount: quote.quote.rentalAmount,
    });

    // A shorter trip that fits around the block and the booking's buffer
    const evening = await search(trip(14, 62));
    expect(idsOf(evening)).toContain(blocked.id);
    expect(idsOf(evening)).not.toContain(tooShort.id);
    expect(idsOf(evening)).not.toContain(tooLong.id);
  });

  it('keeps the cleaning buffer free on both sides of a booking', async () => {
    // Booking ends 1 hour before pickup; its 2-hour buffer runs into the trip.
    const before = await seedCar();
    await seedBooking(before.id, 'IN_PROGRESS', later(-25), later(-1));
    // Booking starts 1 hour after return; this car's 2-hour buffer would run into it.
    const after = await seedCar({ bufferMinutes: 120 });
    await seedBooking(after.id, 'AWAITING_PAYMENT', later(25), later(49));
    // Same, but this car needs no buffer.
    const noBuffer = await seedCar({ bufferMinutes: 0 });
    await seedBooking(noBuffer.id, 'CONFIRMED', later(25), later(49));
    // The booking's buffer was locked in at 30 minutes and ends right at pickup.
    const shortBuffer = await seedCar();
    await seedBooking(shortBuffer.id, 'CONFIRMED', later(-24.5), later(-0.5), 30);

    const page = await search(trip(0, 24));
    expect(idsOf(page).toSorted()).toEqual([noBuffer.id, shortBuffer.id].toSorted());
  });

  it('sorts by rating, then newest by default, and pages without gaps', async () => {
    const oldest = await seedCar({ reviewedAt: new Date(Date.now() - 3 * HOUR) });
    const middle = await seedCar({ reviewedAt: new Date(Date.now() - 2 * HOUR) });
    const newest = await seedCar({ reviewedAt: new Date(Date.now() - HOUR) });
    await seedReview(oldest.id, 5);
    await seedReview(oldest.id, 4);
    await seedReview(middle.id, 3);
    // Not published yet: does not count
    await seedReview(newest.id, 5, false);

    const byRating = await search({ sort: 'rating' });
    expect(idsOf(byRating)).toEqual([oldest.id, middle.id, newest.id]);
    expect(byRating.items[0]).toMatchObject({ rating: { average: 4.5, count: 2 }, tripCount: 2 });
    expect(byRating.items[2]).toMatchObject({ rating: { average: null, count: 0 }, tripCount: 1 });

    expect(idsOf(await search())).toEqual([newest.id, middle.id, oldest.id]);

    const first = await search({ pageSize: 2 });
    const second = await search({ pageSize: 2, page: 2 });
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(idsOf(first)).toEqual([newest.id, middle.id]);
    expect(second).toMatchObject({ page: 2, total: 3 });
    expect(idsOf(second)).toEqual([oldest.id]);
    expect((await search({ pageSize: 2, page: 3 })).items).toEqual([]);
  });

  it('refuses an invalid query with field details', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/cars')
      .query({ startAt: tripStart.toISOString(), sort: 'distance' })
      .expect(400);
    const error = apiErrorSchema.parse(res.body);
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.details?.map((d) => d.path).toSorted()).toEqual(['endAt', 'sort']);
  });
});
