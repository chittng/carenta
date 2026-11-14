import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  APPROX_LOCATION_RADIUS_M,
  type CarQuoteInput,
  distanceKm,
  ErrorCode,
  maskLicensePlate,
  paginationQuerySchema,
  type PriceQuote,
  type PublicCar,
  type PublicCarReviewPage,
  type QuoteErrorCode,
  quoteRental,
  tripWindowIssue,
  vietnamDate,
} from '@carenta/shared';

import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../storage/uploads.service.js';
import { UsersService } from '../users/users.service.js';
import { freeForTripSql } from './availability.js';
import { modelWithMake, toDeliveryView, toPricingView } from './cars.mapper.js';
import { listedCarWhere } from './public-cars.policy.js';

/** No exact coordinates, address line, documents or revisions are even selected. */
const PUBLIC_CAR_SELECT = {
  id: true,
  ownerId: true,
  year: true,
  licensePlate: true,
  color: true,
  bodyType: true,
  seats: true,
  transmission: true,
  fuelType: true,
  fuelConsumption: true,
  odometerKm: true,
  description: true,
  ruleNoSmoking: true,
  ruleNoPets: true,
  ruleNoDurianSeafood: true,
  ruleSameFuelLevel: true,
  ruleKeepClean: true,
  rulesNote: true,
  dailyKmLimit: true,
  extraKmFee: true,
  province: true,
  ward: true,
  approxLatitude: true,
  approxLongitude: true,
  instantBook: true,
  depositAmount: true,
  bufferMinutes: true,
  deliveryEnabled: true,
  deliveryMaxRadiusKm: true,
  deliveryFeePerKm: true,
  deliveryFreeRadiusKm: true,
  model: modelWithMake,
  pricing: true,
  amenities: {
    select: { amenity: { select: { id: true, code: true, name: true, sortOrder: true } } },
  },
  photos: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { id: true, position: true, fileKey: true },
  },
  _count: { select: { bookings: { where: { status: 'COMPLETED' } } } },
} as const satisfies Prisma.CarSelect;

const QUOTE_CAR_SELECT = {
  id: true,
  pricing: true,
  depositAmount: true,
  bufferMinutes: true,
  approxLatitude: true,
  approxLongitude: true,
  deliveryEnabled: true,
  deliveryMaxRadiusKm: true,
  deliveryFreeRadiusKm: true,
  deliveryFeePerKm: true,
} as const satisfies Prisma.CarSelect;

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Không tìm thấy xe đang hiển thị.');

const QUOTE_ERROR: Record<QuoteErrorCode, ErrorCode> = {
  INVALID_RANGE: ErrorCode.VALIDATION_FAILED,
  OFF_STEP: ErrorCode.VALIDATION_FAILED,
  TOO_SHORT: ErrorCode.RENTAL_TOO_SHORT,
  TOO_LONG: ErrorCode.RENTAL_TOO_LONG,
  NO_PRICE: ErrorCode.RENTAL_PRICE_UNAVAILABLE,
  DELIVERY_UNAVAILABLE: ErrorCode.DELIVERY_UNAVAILABLE,
  DELIVERY_TOO_FAR: ErrorCode.DELIVERY_TOO_FAR,
};

type ReviewQuery = { page: number; pageSize: number };

@Injectable()
export class PublicCarsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  async get(carId: string, now = new Date()): Promise<PublicCar> {
    const car = await this.prisma.car.findFirst({
      where: { id: carId, ...listedCarWhere(now) },
      select: PUBLIC_CAR_SELECT,
    });
    if (!car?.pricing) throw notFound();
    const [owner, reviews, rating] = await Promise.all([
      this.users.getPublic(car.ownerId, now),
      this.reviewPage(car.id, paginationQuerySchema.parse({})),
      this.prisma.review.aggregate({
        where: publishedCarReviews(car.id),
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);
    const average = rating._avg.rating;
    return {
      id: car.id,
      make: car.model.make,
      model: { id: car.model.id, name: car.model.name },
      year: car.year,
      licensePlate: maskLicensePlate(car.licensePlate),
      color: car.color,
      bodyType: car.bodyType,
      seats: car.seats,
      transmission: car.transmission,
      fuelType: car.fuelType,
      fuelConsumption: car.fuelConsumption?.toNumber() ?? null,
      odometerKm: car.odometerKm,
      description: car.description,
      rules: {
        noSmoking: car.ruleNoSmoking,
        noPets: car.ruleNoPets,
        noDurianSeafood: car.ruleNoDurianSeafood,
        sameFuelLevel: car.ruleSameFuelLevel,
        keepClean: car.ruleKeepClean,
        note: car.rulesNote,
      },
      mileageLimit:
        car.dailyKmLimit !== null && car.extraKmFee !== null
          ? { dailyKm: car.dailyKmLimit, extraFeePerKm: car.extraKmFee }
          : null,
      location: {
        province: car.province,
        ward: car.ward,
        latitude: car.approxLatitude.toNumber(),
        longitude: car.approxLongitude.toNumber(),
        radiusMeters: APPROX_LOCATION_RADIUS_M,
      },
      amenities: car.amenities
        .map(({ amenity }) => amenity)
        .toSorted((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
        .map(({ id, code, name }) => ({ id, code, name })),
      photos: car.photos.map((photo) => ({
        id: photo.id,
        position: photo.position,
        urls: this.uploads.carPhotoUrls(photo.fileKey),
      })),
      instantBook: car.instantBook,
      depositAmount: car.depositAmount,
      bufferMinutes: car.bufferMinutes,
      delivery: toDeliveryView(car),
      pricing: {
        ...toPricingView(car.pricing),
        dailyEquivalentPrice: car.pricing.dailyEquivalentPrice,
      },
      owner,
      rating: {
        average: average === null ? null : Math.round(average * 10) / 10,
        count: rating._count._all,
      },
      tripCount: car._count.bookings,
      reviews,
    };
  }

  async reviews(carId: string, query: ReviewQuery, now = new Date()): Promise<PublicCarReviewPage> {
    const car = await this.prisma.car.findFirst({
      where: { id: carId, ...listedCarWhere(now) },
      select: { id: true },
    });
    if (!car) throw notFound();
    return this.reviewPage(car.id, query);
  }

  async quote(carId: string, input: CarQuoteInput, now = new Date()): Promise<PriceQuote> {
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    const windowIssue = tripWindowIssue(startAt, endAt, now);
    if (windowIssue)
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        windowIssue.message,
        [windowIssue],
      );
    if (input.pickupMethod === 'DELIVERY' && !input.deliveryLocation) {
      const message = 'Vui lòng chọn vị trí giao xe.';
      throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, message, [
        { path: 'deliveryLocation', message },
      ]);
    }

    // One consistent snapshot of settings, holiday dates and availability; no lock/hold
    // is taken by a preview. Booking creation must recheck inside its write transaction.
    return this.prisma.$transaction(
      async (tx) => {
        const car = await tx.car.findFirst({
          where: { id: carId, ...listedCarWhere(now) },
          select: QUOTE_CAR_SELECT,
        });
        if (!car?.pricing) throw notFound();
        const holidays = await tx.holiday.findMany({
          where: {
            date: {
              gte: fromDateOnly(vietnamDate(startAt)),
              lte: fromDateOnly(vietnamDate(endAt)),
            },
          },
          select: { date: true },
        });
        // Deliberately use the PUBLIC fixed point for both radius and fee (decided 2026-11-14).
        // CARENTA-29 must use the same origin; using exact coordinates exposes them by probing.
        const deliveryDistanceKm =
          input.pickupMethod === 'DELIVERY' && input.deliveryLocation
            ? distanceKm(
                {
                  latitude: car.approxLatitude.toNumber(),
                  longitude: car.approxLongitude.toNumber(),
                },
                input.deliveryLocation,
              )
            : null;
        const priced = quoteRental({
          pricing: car.pricing,
          depositAmount: car.depositAmount,
          delivery: toDeliveryView(car),
          startAt,
          endAt,
          holidays: holidays.map((holiday) => toDateOnly(holiday.date)),
          deliveryDistanceKm,
        });
        if (!priced.ok)
          throw new AppException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            QUOTE_ERROR[priced.code],
            priced.message,
          );

        const blockedUntil = new Date(endAt.getTime() + car.bufferMinutes * 60_000);
        const [row] = await tx.$queryRaw<{ free: boolean }[]>`
        SELECT ${freeForTripSql(
          Prisma.sql`${car.id}::uuid`,
          Prisma.sql`${startAt.toISOString()}::timestamptz`,
          Prisma.sql`${endAt.toISOString()}::timestamptz`,
          Prisma.sql`${blockedUntil.toISOString()}::timestamptz`,
        )} AS free`;
        if (!row?.free)
          throw new AppException(
            HttpStatus.CONFLICT,
            ErrorCode.CAR_UNAVAILABLE,
            'Xe không còn trống trong khoảng thời gian đã chọn. Vui lòng chọn thời gian khác.',
          );
        return priced.quote;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async reviewPage(carId: string, query: ReviewQuery): Promise<PublicCarReviewPage> {
    const where = publishedCarReviews(carId);
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          rating: true,
          comment: true,
          publishedAt: true,
          author: { select: { id: true, fullName: true, avatarKey: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      items: reviews.flatMap((review) =>
        review.publishedAt
          ? [
              {
                id: review.id,
                rating: review.rating,
                comment: review.comment,
                publishedAt: review.publishedAt.toISOString(),
                author: {
                  id: review.author.id,
                  fullName: review.author.fullName,
                  avatarUrl: review.author.avatarKey
                    ? this.uploads.avatarUrl(review.author.avatarKey)
                    : null,
                },
              },
            ]
          : [],
      ),
      ...query,
      total,
    };
  }
}

const publishedCarReviews = (carId: string): Prisma.ReviewWhereInput => ({
  booking: { carId },
  direction: 'RENTER_TO_OWNER',
  publishedAt: { not: null },
});
