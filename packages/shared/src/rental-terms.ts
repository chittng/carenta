import { z } from 'zod';

import { TIME_STEP_MINUTES } from './constants.js';
import { formatVnd } from './money.js';

// ─── Rules (spec §4.2–4.6, §12.4) ───────────────────────────────────────────

export const HOURS_PER_DAY = 24;
/** [Đề xuất] A rental month is 30 days. */
export const DAYS_PER_MONTH = 30;

/** The long-rental discount applies from this many days (spec §4.2). */
export const LONG_RENTAL_MIN_DAYS = 7;

export const DEPOSIT_DEFAULT = 5_000_000;
export const DEPOSIT_MAX = 50_000_000;

export const BUFFER_DEFAULT_MINUTES = 120;
/** [Đề xuất] Up to one day between trips, in 30-minute steps like pickup and return times. */
export const BUFFER_MAX_MINUTES = 24 * 60;

/** Without a set late fee, an hour late costs this share of the daily price (spec §12.4). */
export const DEFAULT_LATE_FEE_PERCENT_OF_DAILY = 10;

/** [Đề xuất] Longest trip an owner can allow. */
export const MAX_RENTAL_DAYS_LIMIT = 180;

/** [Đề xuất] Furthest an owner can offer to deliver the car. */
export const DELIVERY_RADIUS_MAX_KM = 50;

/**
 * [Đề xuất] Bounds for prices set by owners, to catch typos (an extra or missing zero).
 * Every amount is a whole number of thousand đồng.
 */
export const PRICE_LIMITS = {
  hourly: { min: 10_000, max: 5_000_000 },
  daily: { min: 100_000, max: 50_000_000 },
  monthly: { min: 1_000_000, max: 1_000_000_000 },
  lateFeePerHour: { min: 1_000, max: 5_000_000 },
  deliveryFeePerKm: { min: 0, max: 100_000 },
} as const;

export const MONEY_STEP = 1_000;

// ─── Helpers ────────────────────────────────────────────────────────────────

const vnd = (label: string, { min, max }: { min: number; max: number }) => {
  const range = `${label} từ ${formatVnd(min)} đến ${formatVnd(max)}.`;
  return z
    .int({ error: `${label} không hợp lệ.` })
    .min(min, { error: range })
    .max(max, { error: range })
    .multipleOf(MONEY_STEP, { error: `${label} phải tròn nghìn đồng.` });
};

const percent = (label: string, max: number) =>
  z
    .int({ error: `${label} không hợp lệ.` })
    .min(1, { error: `${label} từ 1% đến ${max}%.` })
    .max(max, { error: `${label} từ 1% đến ${max}%.` });

interface UnitPrices {
  hourlyPrice: number | null;
  dailyPrice: number | null;
  monthlyPrice: number | null;
}

/**
 * The shortest trip that does not round up to a unit the renter did not ask for (decided
 * 2026-11-14): any length with an hourly price, a day without one, a month with only a
 * monthly price. The minimum rental time cannot be shorter.
 */
export function smallestUnitHours(prices: UnitPrices): number {
  if (prices.hourlyPrice !== null) return 1;
  if (prices.dailyPrice !== null) return HOURS_PER_DAY;
  return DAYS_PER_MONTH * HOURS_PER_DAY;
}

/**
 * Late fee per hour after the 30-minute grace period (spec §12.4): the owner's own amount,
 * or 10% of the daily price. A car without a daily price must set one (decided 2026-11-14).
 */
export function effectiveLateFeePerHour(pricing: {
  dailyPrice: number | null;
  lateFeePerHour: number | null;
}): number {
  if (pricing.lateFeePerHour !== null) return pricing.lateFeePerHour;
  if (pricing.dailyPrice === null) {
    throw new Error('A car without a daily price must set its late fee');
  }
  return Math.round((pricing.dailyPrice * DEFAULT_LATE_FEE_PERCENT_OF_DAILY) / 100);
}

// ─── Input ──────────────────────────────────────────────────────────────────

/**
 * The car's price list (spec §4.2), replaced whole. A null price turns that unit off; at
 * least one unit must be on. Optional surcharges and discount are null when not used.
 */
export const carPricingSchema = z
  .object({
    hourlyPrice: vnd('Giá theo giờ', PRICE_LIMITS.hourly).nullable(),
    dailyPrice: vnd('Giá theo ngày', PRICE_LIMITS.daily).nullable(),
    monthlyPrice: vnd('Giá theo tháng', PRICE_LIMITS.monthly).nullable(),
    minDurationHours: z
      .int({ error: 'Thời gian thuê tối thiểu không hợp lệ.' })
      .min(1, { error: 'Thời gian thuê tối thiểu ít nhất 1 giờ.' })
      .max(MAX_RENTAL_DAYS_LIMIT * HOURS_PER_DAY, {
        error: `Thời gian thuê tối thiểu không quá ${MAX_RENTAL_DAYS_LIMIT} ngày.`,
      }),
    maxDurationDays: z
      .int({ error: 'Thời gian thuê tối đa không hợp lệ.' })
      .min(1, { error: 'Thời gian thuê tối đa ít nhất 1 ngày.' })
      .max(MAX_RENTAL_DAYS_LIMIT, {
        error: `Thời gian thuê tối đa không quá ${MAX_RENTAL_DAYS_LIMIT} ngày.`,
      }),
    weekendSurchargePercent: percent('Phụ phí cuối tuần', 100).nullable().default(null),
    holidaySurchargePercent: percent('Phụ phí ngày lễ', 100).nullable().default(null),
    /** [Đề xuất] At most 50% off. */
    longRentalDiscountPercent: percent('Giảm giá thuê dài', 50).nullable().default(null),
    /** Null: 10% of the daily price. Required when there is no daily price. */
    lateFeePerHour: vnd('Phí trả trễ mỗi giờ', PRICE_LIMITS.lateFeePerHour)
      .nullable()
      .default(null),
  })
  .superRefine((pricing, ctx) => {
    if (
      pricing.hourlyPrice === null &&
      pricing.dailyPrice === null &&
      pricing.monthlyPrice === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dailyPrice'],
        message: 'Bật ít nhất một đơn vị giá: theo giờ, theo ngày hoặc theo tháng.',
      });
      return;
    }

    const floor = smallestUnitHours(pricing);
    if (pricing.minDurationHours < floor) {
      ctx.addIssue({
        code: 'custom',
        path: ['minDurationHours'],
        message:
          floor === HOURS_PER_DAY
            ? 'Xe không có giá theo giờ nên thời gian thuê tối thiểu phải từ 24 giờ.'
            : `Xe chỉ có giá theo tháng nên thời gian thuê tối thiểu phải từ ${DAYS_PER_MONTH} ngày.`,
      });
    } else if (pricing.minDurationHours > pricing.maxDurationDays * HOURS_PER_DAY) {
      ctx.addIssue({
        code: 'custom',
        path: ['minDurationHours'],
        message: 'Thời gian thuê tối thiểu không được dài hơn thời gian thuê tối đa.',
      });
    }

    if (
      pricing.longRentalDiscountPercent !== null &&
      pricing.maxDurationDays < LONG_RENTAL_MIN_DAYS
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['longRentalDiscountPercent'],
        message: `Giảm giá thuê dài áp dụng từ ${LONG_RENTAL_MIN_DAYS} ngày, nhưng xe chỉ cho thuê tối đa ${pricing.maxDurationDays} ngày.`,
      });
    }

    if (pricing.dailyPrice === null && pricing.lateFeePerHour === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['lateFeePerHour'],
        message: 'Xe không có giá theo ngày nên cần nhập phí trả trễ mỗi giờ.',
      });
    }
  });

/**
 * Delivery to the renter's address (spec §4.4). The first `freeRadiusKm` are free and each
 * km beyond costs `feePerKm` (decided 2026-11-14). Pickup at the car is always available.
 */
export const carDeliverySchema = z
  .object({
    maxRadiusKm: z
      .int({ error: 'Bán kính giao xe không hợp lệ.' })
      .min(1, { error: `Bán kính giao xe từ 1 đến ${DELIVERY_RADIUS_MAX_KM} km.` })
      .max(DELIVERY_RADIUS_MAX_KM, {
        error: `Bán kính giao xe từ 1 đến ${DELIVERY_RADIUS_MAX_KM} km.`,
      }),
    feePerKm: vnd('Phí giao xe mỗi km', PRICE_LIMITS.deliveryFeePerKm),
    freeRadiusKm: z
      .int({ error: 'Số km miễn phí không hợp lệ.' })
      .min(0, { error: 'Số km miễn phí không hợp lệ.' })
      .max(DELIVERY_RADIUS_MAX_KM, { error: 'Số km miễn phí không hợp lệ.' }),
  })
  .refine((delivery) => delivery.freeRadiusKm <= delivery.maxRadiusKm, {
    path: ['freeRadiusKm'],
    error: 'Số km miễn phí không được lớn hơn bán kính giao xe.',
  });

/** Rental settings stored on the car; edited with the car's other details. */
export const rentalSettingsFields = {
  /** Đặt nhanh: confirmed on payment. Off: the owner approves each request (spec §4.5). */
  instantBook: z.boolean(),
  depositAmount: vnd('Tiền cọc', { min: 0, max: DEPOSIT_MAX }),
  /** Kept free after each trip for cleaning (spec §4.3). */
  bufferMinutes: z
    .int({ error: 'Thời gian đệm không hợp lệ.' })
    .min(0, { error: 'Thời gian đệm từ 0 đến 24 giờ.' })
    .max(BUFFER_MAX_MINUTES, { error: 'Thời gian đệm từ 0 đến 24 giờ.' })
    .multipleOf(TIME_STEP_MINUTES, { error: `Thời gian đệm theo bước ${TIME_STEP_MINUTES} phút.` }),
  /** Null: pickup at the car only. */
  delivery: carDeliverySchema.nullable(),
};

// ─── Output ─────────────────────────────────────────────────────────────────

export const carPricingViewSchema = z.object({
  hourlyPrice: z.int().nullable(),
  dailyPrice: z.int().nullable(),
  monthlyPrice: z.int().nullable(),
  minDurationHours: z.int(),
  maxDurationDays: z.int(),
  weekendSurchargePercent: z.int().nullable(),
  holidaySurchargePercent: z.int().nullable(),
  longRentalDiscountPercent: z.int().nullable(),
  /** As set by the owner; null means the default. */
  lateFeePerHour: z.int().nullable(),
  /** What a renter is charged per late hour: the owner's amount or 10% of the daily price. */
  effectiveLateFeePerHour: z.int(),
});

export const carDeliveryViewSchema = z.object({
  maxRadiusKm: z.int(),
  feePerKm: z.int(),
  freeRadiusKm: z.int(),
});

export type CarPricingInput = z.infer<typeof carPricingSchema>;
export type CarDelivery = z.infer<typeof carDeliverySchema>;
export type CarPricingView = z.infer<typeof carPricingViewSchema>;
