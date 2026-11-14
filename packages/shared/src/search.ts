import { z } from 'zod';

import {
  BodyType,
  CAR_SEATS_MAX,
  CAR_SEATS_MIN,
  carPhotoUrlsSchema,
  catalogRefSchema,
  FuelType,
  Transmission,
  VIETNAM_BOUNDS,
} from './cars.js';
import { pageOf } from './pagination.js';
import { tripWindowIssue } from './rental-terms.js';

/**
 * Car search (spec §5.1, decided 2026-11-14):
 * - Only listed cars: approved and not paused, hidden or removed, whose owner is not locked.
 * - Pickup and return times are optional. Without them nothing is checked against the
 *   calendar and there is no price estimate. With them, they must pass the booking rules
 *   (`tripWindowIssue`), and only cars free for the whole trip whose minimum and maximum
 *   rental length allow it are returned.
 * - Price filter and price sort use the daily equivalent price, which does not depend on
 *   the chosen times: the daily price, else the lower of 24 × hourly and monthly ÷ 30.
 * - Positions are approximate: each car is moved by a fixed 200 m–1 km offset. The radius
 *   filter and the distance sort use that position too, so they reveal nothing more.
 * - Default order: nearest first when searching around a point, otherwise newest first.
 */

// ─── Rules ──────────────────────────────────────────────────────────────────

/** [Đề xuất] Searching around a point covers this many km unless told otherwise. */
export const SEARCH_RADIUS_DEFAULT_KM = 10;
/** [Đề xuất] The widest search radius. */
export const SEARCH_RADIUS_MAX_KM = 50;
export const SEARCH_PAGE_SIZE_DEFAULT = 20;
export const SEARCH_PAGE_SIZE_MAX = 50;
/** Radius of the circle drawn around a car's approximate position; the car is inside it. */
export const APPROX_LOCATION_RADIUS_M = 1000;

export const CarSearchSort = {
  /** Cheapest daily equivalent price first */
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  /** Highest average rating first; cars without reviews last */
  RATING: 'rating',
  /** Nearest first; needs `lat` and `lng` */
  DISTANCE: 'distance',
  /** Most recently approved first */
  NEWEST: 'newest',
} as const;
export type CarSearchSort = (typeof CarSearchSort)[keyof typeof CarSearchSort];

// ─── Query ──────────────────────────────────────────────────────────────────

/** Free text for a province or ward; blank means no filter. */
const placeText = z
  .string()
  .trim()
  .max(100, { error: 'Địa điểm tối đa 100 ký tự.' })
  .transform((value) => (value === '' ? undefined : value.normalize('NFC')))
  .optional();

/**
 * A list in the query string, repeated (`?fuelTypes=DIESEL&fuelTypes=HYBRID`) or
 * comma-separated (`?fuelTypes=DIESEL,HYBRID`). Duplicates are dropped.
 */
const queryList = <T extends z.ZodType>(item: T, max: number) =>
  z
    .preprocess((value: unknown): unknown => {
      if (value === undefined) return undefined;
      const entries: unknown[] = Array.isArray(value) ? value : [value];
      // Anything that is not a string is left for the array schema to reject.
      if (!entries.every((entry) => typeof entry === 'string')) return value;
      const items = entries
        .flatMap((entry) => entry.split(','))
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
      return [...new Set(items)];
    }, z.array(item).max(max))
    .optional();

const queryId = z.coerce.number().int().positive();

const coordinate = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label} không hợp lệ.` })
    .min(min, { error: 'Vị trí tìm kiếm phải nằm ở Việt Nam.' })
    .max(max, { error: 'Vị trí tìm kiếm phải nằm ở Việt Nam.' })
    .optional();

const price = z.coerce.number().int({ error: 'Giá không hợp lệ.' }).min(0).optional();

const seats = z.coerce
  .number()
  .int()
  .min(CAR_SEATS_MIN, { error: `Số chỗ từ ${CAR_SEATS_MIN} đến ${CAR_SEATS_MAX}.` })
  .max(CAR_SEATS_MAX, { error: `Số chỗ từ ${CAR_SEATS_MIN} đến ${CAR_SEATS_MAX}.` })
  .optional();

const instant = z.iso.datetime({ offset: true, error: 'Thời gian không hợp lệ.' }).optional();

export const carSearchQuerySchema = z
  .object({
    /** Part of the province name, e.g. `Hồ Chí Minh`; case-insensitive. */
    province: placeText,
    /** Part of the ward name. Since 1/7/2025 there are no districts (spec §15). */
    ward: placeText,
    /** Search around a point: both `lat` and `lng`, optionally `radiusKm` (default 10). */
    lat: coordinate('Vĩ độ', VIETNAM_BOUNDS.minLatitude, VIETNAM_BOUNDS.maxLatitude),
    lng: coordinate('Kinh độ', VIETNAM_BOUNDS.minLongitude, VIETNAM_BOUNDS.maxLongitude),
    radiusKm: z.coerce
      .number()
      .positive({ error: `Bán kính từ 1 đến ${SEARCH_RADIUS_MAX_KM} km.` })
      .max(SEARCH_RADIUS_MAX_KM, { error: `Bán kính tối đa ${SEARCH_RADIUS_MAX_KM} km.` })
      .optional(),
    /** Pickup and return, both or neither (ISO 8601 with offset, 30-minute steps). */
    startAt: instant,
    endAt: instant,
    /** Daily equivalent price range, VND. */
    minPrice: price,
    maxPrice: price,
    makeIds: queryList(queryId, 50),
    bodyTypes: queryList(z.enum(BodyType), 10),
    transmissions: queryList(z.enum(Transmission), 10),
    fuelTypes: queryList(z.enum(FuelType), 10),
    seatsMin: seats,
    seatsMax: seats,
    /** true: only Đặt nhanh cars; false: only cars the owner approves by hand. */
    instantBook: z.stringbool().optional(),
    /** true: only cars that deliver; false: only pickup at the car. */
    delivery: z.stringbool().optional(),
    /** Cars must have every one of these. */
    amenityIds: queryList(queryId, 50),
    sort: z.enum(CarSearchSort).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1)
      .max(SEARCH_PAGE_SIZE_MAX)
      .default(SEARCH_PAGE_SIZE_DEFAULT),
  })
  .superRefine((query, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    const hasPoint = query.lat !== undefined && query.lng !== undefined;
    if ((query.lat === undefined) !== (query.lng === undefined)) {
      issue(query.lat === undefined ? 'lat' : 'lng', 'Cần cả vĩ độ và kinh độ.');
    }
    if (query.radiusKm !== undefined && !hasPoint) {
      issue('radiusKm', 'Bán kính chỉ dùng khi tìm quanh một vị trí.');
    }
    if (query.sort === CarSearchSort.DISTANCE && !hasPoint) {
      issue('sort', 'Sắp xếp theo khoảng cách cần vị trí tìm kiếm.');
    }

    if ((query.startAt === undefined) !== (query.endAt === undefined)) {
      issue(
        query.startAt === undefined ? 'startAt' : 'endAt',
        'Cần chọn cả giờ nhận và giờ trả xe.',
      );
    } else if (query.startAt !== undefined && query.endAt !== undefined) {
      const startAt = new Date(query.startAt);
      const endAt = new Date(query.endAt);
      // An unreadable time already has its own issue.
      const readable = !Number.isNaN(startAt.getTime()) && !Number.isNaN(endAt.getTime());
      const window = readable ? tripWindowIssue(startAt, endAt) : null;
      if (window) issue(window.path, window.message);
    }

    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      issue('maxPrice', 'Giá cao nhất phải lớn hơn hoặc bằng giá thấp nhất.');
    }
    if (
      query.seatsMin !== undefined &&
      query.seatsMax !== undefined &&
      query.seatsMin > query.seatsMax
    ) {
      issue('seatsMax', 'Số chỗ tối đa phải lớn hơn hoặc bằng số chỗ tối thiểu.');
    }
  });

// ─── Output ─────────────────────────────────────────────────────────────────

/** A car in the search results: public data only, no plate and no exact address. */
export const carSearchResultSchema = z.object({
  id: z.uuid(),
  make: catalogRefSchema,
  model: catalogRefSchema,
  year: z.int(),
  bodyType: z.enum(BodyType),
  seats: z.int(),
  transmission: z.enum(Transmission),
  fuelType: z.enum(FuelType),
  coverPhoto: carPhotoUrlsSchema.nullable(),
  /** Đặt nhanh: confirmed as soon as the renter pays (spec §4.5). */
  instantBook: z.boolean(),
  /** The owner delivers (spec §4.4); whether an address is in range is checked per car. */
  deliveryAvailable: z.boolean(),
  /** Approximate: draw a circle of `radiusMeters` around this point. */
  location: z.object({
    province: z.string(),
    ward: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    radiusMeters: z.int(),
  }),
  /** Km from the search point to the approximate position, one decimal; null without a point. */
  distanceKm: z.number().nullable(),
  prices: z.object({
    hourlyPrice: z.int().nullable(),
    dailyPrice: z.int().nullable(),
    monthlyPrice: z.int().nullable(),
    /** What the price filter and sort use. */
    dailyEquivalentPrice: z.int(),
  }),
  /**
   * Rent for the chosen times with surcharges and discount (`quoteRental`), before delivery
   * and deposit. Null when no times were given.
   */
  estimate: z.object({ durationMinutes: z.int(), rentalAmount: z.int() }).nullable(),
  /** Published reviews of trips with this car. Average is null without reviews. */
  rating: z.object({ average: z.number().nullable(), count: z.int() }),
  /** Completed trips with this car. */
  tripCount: z.int(),
});

export const carSearchPageSchema = pageOf(carSearchResultSchema);

export type CarSearchQuery = z.infer<typeof carSearchQuerySchema>;
export type CarSearchResult = z.infer<typeof carSearchResultSchema>;
export type CarSearchPage = z.infer<typeof carSearchPageSchema>;
