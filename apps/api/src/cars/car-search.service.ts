import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  APPROX_LOCATION_RADIUS_M,
  type CarSearchPage,
  type CarSearchQuery,
  type CarSearchResult,
  CarSearchSort,
  quoteRental,
  SEARCH_RADIUS_DEFAULT_KM,
  vietnamDate,
} from '@carenta/shared';

import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../storage/uploads.service.js';
import { modelWithMake } from './cars.mapper.js';

const MINUTES_PER_DAY = 24 * 60;
const KM_PER_DEGREE_LATITUDE = 111.32;
const EARTH_RADIUS_KM = 6371;

/** Booking statuses that hold the calendar (spec §4.3); the same set as `bookings_no_overlap`. */
const HOLDING_STATUSES = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] as const;

interface Point {
  lat: number;
  lng: number;
  radiusKm: number;
}

interface Trip {
  startAt: Date;
  endAt: Date;
  minutes: number;
}

interface MatchRow {
  id: string;
  distance_km: number | null;
  rating_average: number | null;
  rating_count: number;
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Public car search (spec §5.1). Filtering, sorting and paging run in one SQL query so the
 * total is exact; the page is then loaded with Prisma and priced with `quoteRental`.
 * The rules and the decisions behind them are documented on `carSearchQuerySchema`.
 */
@Injectable()
export class CarSearchService {
  private readonly logger = new Logger(CarSearchService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}

  async search(query: CarSearchQuery, now = new Date()): Promise<CarSearchPage> {
    const point: Point | null =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng, radiusKm: query.radiusKm ?? SEARCH_RADIUS_DEFAULT_KM }
        : null;
    let trip: Trip | null = null;
    if (query.startAt !== undefined && query.endAt !== undefined) {
      const startAt = new Date(query.startAt);
      const endAt = new Date(query.endAt);
      trip = { startAt, endAt, minutes: (endAt.getTime() - startAt.getTime()) / 60_000 };
    }

    const from = Prisma.sql`
      FROM cars c
      JOIN car_pricings p ON p.car_id = c.id
      JOIN car_models m ON m.id = c.model_id
      JOIN users o ON o.id = c.owner_id`;
    const where = Prisma.sql`WHERE ${Prisma.join(this.conditions(query, point, trip, now), ' AND ')}`;
    const distance = point ? distanceKmSql(point) : Prisma.sql`NULL::float8`;
    const sort = query.sort ?? (point ? CarSearchSort.DISTANCE : CarSearchSort.NEWEST);

    const [rows, [count]] = await Promise.all([
      this.prisma.$queryRaw<MatchRow[]>`
        SELECT c.id, ${distance} AS distance_km,
          rv.average AS rating_average, rv.count AS rating_count
        ${from}
        LEFT JOIN LATERAL (
          SELECT avg(r.rating)::float8 AS average, count(*)::int AS count
          FROM reviews r
          JOIN bookings b ON b.id = r.booking_id
          WHERE b.car_id = c.id
            AND r.direction = 'RENTER_TO_OWNER'
            AND r.published_at IS NOT NULL
        ) rv ON true
        ${where}
        ORDER BY ${ORDER_BY[sort]}
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${from} ${where}`,
    ]);

    return {
      items: await this.load(rows, trip),
      page: query.page,
      pageSize: query.pageSize,
      total: count?.total ?? 0,
    };
  }

  private conditions(
    query: CarSearchQuery,
    point: Point | null,
    trip: Trip | null,
    now: Date,
  ): Prisma.Sql[] {
    // Listed: approved, not paused/hidden/removed, not hidden for owner cancellations, and
    // the owner's account is not locked (spec §12.3, §12.5).
    const conditions = [
      Prisma.sql`c.status = 'ACTIVE'`,
      Prisma.sql`(c.hidden_until IS NULL OR c.hidden_until <= ${now.toISOString()}::timestamptz)`,
      Prisma.sql`o.status = 'ACTIVE'`,
    ];
    const add = (condition: Prisma.Sql) => conditions.push(condition);

    if (query.province) add(Prisma.sql`c.province ILIKE ${`%${escapeLike(query.province)}%`}`);
    if (query.ward) add(Prisma.sql`c.ward ILIKE ${`%${escapeLike(query.ward)}%`}`);

    if (point) {
      // Box first so the (approx_latitude, approx_longitude) index can narrow the scan.
      const dLat = point.radiusKm / KM_PER_DEGREE_LATITUDE;
      const dLng =
        point.radiusKm / (KM_PER_DEGREE_LATITUDE * Math.cos((point.lat * Math.PI) / 180));
      // Numeric bounds: a float8 one would cast the column and skip the index.
      add(
        Prisma.sql`c.approx_latitude BETWEEN ${point.lat - dLat}::numeric AND ${point.lat + dLat}::numeric`,
      );
      add(
        Prisma.sql`c.approx_longitude BETWEEN ${point.lng - dLng}::numeric AND ${point.lng + dLng}::numeric`,
      );
      add(Prisma.sql`${distanceKmSql(point)} <= ${point.radiusKm}`);
    }

    if (query.minPrice !== undefined) {
      add(Prisma.sql`p.daily_equivalent_price >= ${query.minPrice}`);
    }
    if (query.maxPrice !== undefined) {
      add(Prisma.sql`p.daily_equivalent_price <= ${query.maxPrice}`);
    }
    if (query.makeIds?.length) add(Prisma.sql`m.make_id IN (${Prisma.join(query.makeIds)})`);
    if (query.bodyTypes?.length) {
      add(Prisma.sql`c.body_type::text IN (${Prisma.join(query.bodyTypes)})`);
    }
    if (query.transmissions?.length) {
      add(Prisma.sql`c.transmission::text IN (${Prisma.join(query.transmissions)})`);
    }
    if (query.fuelTypes?.length) {
      add(Prisma.sql`c.fuel_type::text IN (${Prisma.join(query.fuelTypes)})`);
    }
    if (query.seatsMin !== undefined) add(Prisma.sql`c.seats >= ${query.seatsMin}`);
    if (query.seatsMax !== undefined) add(Prisma.sql`c.seats <= ${query.seatsMax}`);
    if (query.instantBook !== undefined) add(Prisma.sql`c.instant_book = ${query.instantBook}`);
    if (query.delivery !== undefined) add(Prisma.sql`c.delivery_enabled = ${query.delivery}`);
    if (query.amenityIds?.length) {
      add(Prisma.sql`(
        SELECT count(*) FROM car_amenities ca
        WHERE ca.car_id = c.id AND ca.amenity_id IN (${Prisma.join(query.amenityIds)})
      ) = ${query.amenityIds.length}`);
    }

    if (trip) {
      const start = Prisma.sql`${trip.startAt.toISOString()}::timestamptz`;
      const end = Prisma.sql`${trip.endAt.toISOString()}::timestamptz`;
      // The car's own minimum and maximum length, as `quoteRental` checks them.
      add(Prisma.sql`p.min_duration_hours * 60 <= ${trip.minutes}`);
      add(Prisma.sql`p.max_duration_days * ${MINUTES_PER_DAY} >= ${trip.minutes}`);
      // Free of the owner's blocks, half-open [start_at, end_at).
      add(Prisma.sql`NOT EXISTS (
        SELECT 1 FROM availability_blocks ab
        WHERE ab.car_id = c.id AND ab.start_at < ${end} AND ab.end_at > ${start}
      )`);
      // Free of bookings that hold the calendar, buffers included on both sides: the
      // booking's own (locked into blocked_until) and the car's current one after this
      // trip. Same test as the bookings_no_overlap exclusion constraint, so it can use it.
      add(Prisma.sql`NOT EXISTS (
        SELECT 1 FROM bookings bk
        WHERE bk.car_id = c.id
          AND bk.status::text IN (${Prisma.join([...HOLDING_STATUSES])})
          AND tstzrange(bk.start_at, bk.blocked_until, '[)')
            && tstzrange(${start}, ${end} + c.buffer_minutes * interval '1 minute', '[)')
      )`);
    }
    return conditions;
  }

  /** The page's cars in match order, with photos, prices and the trip estimate. */
  private async load(rows: MatchRow[], trip: Trip | null): Promise<CarSearchResult[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [cars, trips, holidays] = await Promise.all([
      this.prisma.car.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          year: true,
          bodyType: true,
          seats: true,
          transmission: true,
          fuelType: true,
          instantBook: true,
          deliveryEnabled: true,
          depositAmount: true,
          province: true,
          ward: true,
          approxLatitude: true,
          approxLongitude: true,
          model: modelWithMake,
          photos: { orderBy: { position: 'asc' }, take: 1, select: { fileKey: true } },
          pricing: true,
        },
      }),
      this.prisma.booking.groupBy({
        by: ['carId'],
        where: { carId: { in: ids }, status: 'COMPLETED' },
        _count: { _all: true },
      }),
      trip ? this.holidaysDuring(trip) : Promise.resolve([]),
    ]);
    const carsById = new Map(cars.map((car) => [car.id, car]));
    const tripCounts = new Map(trips.map((row) => [row.carId, row._count._all]));

    return rows.flatMap((row): CarSearchResult[] => {
      const car = carsById.get(row.id);
      // Gone between the two queries (deleted cars are never listed, so this is a race).
      if (!car?.pricing) return [];
      const pricing = car.pricing;
      const cover = car.photos[0];

      let estimate: CarSearchResult['estimate'] = null;
      if (trip) {
        const result = quoteRental({
          pricing,
          depositAmount: car.depositAmount,
          delivery: null,
          startAt: trip.startAt,
          endAt: trip.endAt,
          holidays,
          deliveryDistanceKm: null,
        });
        if (result.ok) {
          estimate = {
            durationMinutes: result.quote.durationMinutes,
            rentalAmount: result.quote.rentalAmount,
          };
        } else {
          // The SQL filter mirrors quoteRental's checks, so this means they drifted apart.
          this.logger.warn(`Search matched car ${car.id} but could not quote it: ${result.code}`);
        }
      }

      return [
        {
          id: car.id,
          make: car.model.make,
          model: { id: car.model.id, name: car.model.name },
          year: car.year,
          bodyType: car.bodyType,
          seats: car.seats,
          transmission: car.transmission,
          fuelType: car.fuelType,
          coverPhoto: cover ? this.uploads.carPhotoUrls(cover.fileKey) : null,
          instantBook: car.instantBook,
          deliveryAvailable: car.deliveryEnabled,
          location: {
            province: car.province,
            ward: car.ward,
            latitude: car.approxLatitude.toNumber(),
            longitude: car.approxLongitude.toNumber(),
            radiusMeters: APPROX_LOCATION_RADIUS_M,
          },
          distanceKm: row.distance_km === null ? null : Math.round(row.distance_km * 10) / 10,
          prices: {
            hourlyPrice: pricing.hourlyPrice,
            dailyPrice: pricing.dailyPrice,
            monthlyPrice: pricing.monthlyPrice,
            dailyEquivalentPrice: pricing.dailyEquivalentPrice,
          },
          estimate,
          rating: {
            average: row.rating_average === null ? null : Math.round(row.rating_average * 10) / 10,
            count: row.rating_count,
          },
          tripCount: tripCounts.get(car.id) ?? 0,
        },
      ];
    });
  }

  /** Holidays (Vietnam dates) the trip touches, for the holiday surcharge. */
  private async holidaysDuring(trip: Trip): Promise<string[]> {
    const holidays = await this.prisma.holiday.findMany({
      where: {
        date: {
          gte: fromDateOnly(vietnamDate(trip.startAt)),
          lte: fromDateOnly(vietnamDate(trip.endAt)),
        },
      },
      select: { date: true },
    });
    return holidays.map((holiday) => toDateOnly(holiday.date));
  }
}

/** Great-circle km from the search point to the car's approximate position (Haversine). */
function distanceKmSql(point: Point): Prisma.Sql {
  return Prisma.sql`(2 * ${EARTH_RADIUS_KM} * asin(sqrt(LEAST(1,
    power(sin(radians(c.approx_latitude::float8 - ${point.lat}::float8) / 2), 2)
    + cos(radians(${point.lat}::float8)) * cos(radians(c.approx_latitude::float8))
      * power(sin(radians(c.approx_longitude::float8 - ${point.lng}::float8) / 2), 2)
  ))))`;
}

/** Every order ends on the id so pages never overlap or skip a car. */
const ORDER_BY: Record<CarSearchSort, Prisma.Sql> = {
  price_asc: Prisma.sql`p.daily_equivalent_price ASC, c.reviewed_at DESC NULLS LAST, c.id`,
  price_desc: Prisma.sql`p.daily_equivalent_price DESC, c.reviewed_at DESC NULLS LAST, c.id`,
  // Cars without reviews last; "newest" is the most recently approved.
  rating: Prisma.sql`rv.average DESC NULLS LAST, rv.count DESC, c.reviewed_at DESC NULLS LAST, c.id`,
  distance: Prisma.sql`distance_km ASC, c.id`,
  newest: Prisma.sql`c.reviewed_at DESC NULLS LAST, c.id`,
};
