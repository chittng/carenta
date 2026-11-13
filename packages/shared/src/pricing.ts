import { z } from 'zod';

import { TIME_STEP_MINUTES } from './constants.js';
import { formatVnd } from './money.js';
import {
  type CarDelivery,
  DAYS_PER_MONTH,
  HOURS_PER_DAY,
  LONG_RENTAL_MIN_DAYS,
} from './rental-terms.js';

/**
 * Rental price calculation (spec §4.2, decided 2026-11-14). A pure function: the web app
 * uses it to preview, the API runs it again when a booking is made and is the source of
 * truth. Prices are integer VND; times are instants, read in Vietnam time.
 */

// ─── Time ───────────────────────────────────────────────────────────────────

const MINUTE_MS = 60_000;
const SLOT_MS = TIME_STEP_MINUTES * MINUTE_MS;
/** Pricing works in 30-minute slots, the step of pickup and return times. */
const SLOTS_PER_HOUR = 60 / TIME_STEP_MINUTES;
const SLOTS_PER_DAY = HOURS_PER_DAY * SLOTS_PER_HOUR;
const SLOTS_PER_MONTH = DAYS_PER_MONTH * SLOTS_PER_DAY;

/** Vietnam has been on UTC+7 all year, without daylight saving, since 1975. */
const VIETNAM_OFFSET_MS = 7 * 60 * MINUTE_MS;

/** The Vietnam calendar date (`YYYY-MM-DD`) and weekday (0 = Sunday) of an instant. */
function vietnamDay(ms: number): { date: string; weekday: number } {
  const local = new Date(ms + VIETNAM_OFFSET_MS);
  return { date: local.toISOString().slice(0, 10), weekday: local.getUTCDay() };
}

const isWeekend = (weekday: number) => weekday === 0 || weekday === 6;

// ─── Money ──────────────────────────────────────────────────────────────────

/**
 * [Đề xuất] Surcharges and discounts are rounded to the nearest 1.000đ (half up), so every
 * line a renter sees is a round amount. Base prices are already whole thousands, or a half
 * of one for a half hour.
 */
const roundToThousand = (amount: number) => Math.round(amount / 1000) * 1000;

const vnNumber = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

// ─── Units ──────────────────────────────────────────────────────────────────

export interface UnitPrices {
  hourlyPrice: number | null;
  dailyPrice: number | null;
  monthlyPrice: number | null;
}

export interface UnitSplit {
  months: number;
  days: number;
  /** May be a half: a half hour is charged as half the hourly price (decided 2026-11-14). */
  hours: number;
  amount: number;
}

/**
 * The cheapest way to cover `minutes` with the units turned on (spec §4.2). Time left over
 * that no enabled unit can price exactly is rounded up to the next unit, e.g. 26 hours with
 * only a daily price is 2 days, and 23 hours with both is 1 day if that is cheaper.
 * On a tie, bigger units win. Null when no unit is turned on.
 */
export function cheapestUnits(prices: UnitPrices, minutes: number): UnitSplit | null {
  const slots = Math.ceil(minutes / TIME_STEP_MINUTES);
  const { hourlyPrice, dailyPrice, monthlyPrice } = prices;
  const maxMonths = monthlyPrice === null ? 0 : Math.ceil(slots / SLOTS_PER_MONTH);

  let best: UnitSplit | null = null;
  for (let months = maxMonths; months >= 0; months -= 1) {
    const afterMonths = Math.max(0, slots - months * SLOTS_PER_MONTH);
    const maxDays = dailyPrice === null ? 0 : Math.ceil(afterMonths / SLOTS_PER_DAY);
    for (let days = maxDays; days >= 0; days -= 1) {
      const halfHours = Math.max(0, afterMonths - days * SLOTS_PER_DAY);
      if (halfHours > 0 && hourlyPrice === null) continue;
      const amount =
        months * (monthlyPrice ?? 0) +
        days * (dailyPrice ?? 0) +
        (halfHours * (hourlyPrice ?? 0)) / SLOTS_PER_HOUR;
      if (best === null || amount < best.amount) {
        best = { months, days, hours: halfHours / SLOTS_PER_HOUR, amount };
      }
    }
  }
  return best;
}

// ─── Delivery ───────────────────────────────────────────────────────────────

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line distance in km (decided 2026-11-14: no road routing). */
export function distanceKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Km charged for a delivery: the straight-line distance rounded up to a whole km.
 * Rounded to metres first so floating point noise (5.0000000001) does not add a km.
 */
export const chargedKm = (distance: number) => Math.ceil(Math.round(distance * 1000) / 1000);

/**
 * Delivery fee (spec §4.4, decided 2026-11-14): the first `freeRadiusKm` are free and each
 * km beyond costs `feePerKm`. Null when the address is beyond the delivery radius.
 */
export function deliveryFee(settings: CarDelivery, distance: number): number | null {
  const km = chargedKm(distance);
  if (km > settings.maxRadiusKm) return null;
  return Math.max(0, km - settings.freeRadiusKm) * settings.feePerKm;
}

// ─── Quote ──────────────────────────────────────────────────────────────────

export interface QuotePricing extends UnitPrices {
  minDurationHours: number;
  maxDurationDays: number;
  weekendSurchargePercent: number | null;
  holidaySurchargePercent: number | null;
  longRentalDiscountPercent: number | null;
}

export interface QuoteInput {
  pricing: QuotePricing;
  depositAmount: number;
  /** The car's delivery settings; null when it only offers pickup. */
  delivery: CarDelivery | null;
  startAt: Date;
  endAt: Date;
  /** Public holidays as Vietnam dates, `YYYY-MM-DD` (managed in Console). */
  holidays: Iterable<string>;
  /** Straight-line km to the renter's address when they want delivery; null for pickup. */
  deliveryDistanceKm: number | null;
}

export const PriceLineCode = {
  RENTAL_MONTHS: 'RENTAL_MONTHS',
  RENTAL_DAYS: 'RENTAL_DAYS',
  RENTAL_HOURS: 'RENTAL_HOURS',
  WEEKEND_SURCHARGE: 'WEEKEND_SURCHARGE',
  HOLIDAY_SURCHARGE: 'HOLIDAY_SURCHARGE',
  LONG_RENTAL_DISCOUNT: 'LONG_RENTAL_DISCOUNT',
  DELIVERY: 'DELIVERY',
} as const;
export type PriceLineCode = (typeof PriceLineCode)[keyof typeof PriceLineCode];

export const priceLineSchema = z.object({
  code: z.enum(PriceLineCode),
  /** Ready to show, in Vietnamese. */
  label: z.string(),
  /** Months, days or hours for rental lines; km for delivery; null otherwise. */
  quantity: z.number().nullable(),
  unitPrice: z.int().nullable(),
  /** Negative for the discount. */
  amount: z.int(),
});

/** A price quote; also the breakdown locked into a booking (spec §12.1). */
export const priceQuoteSchema = z.object({
  durationMinutes: z.int(),
  lines: z.array(priceLineSchema),
  /** Rental after surcharges and discount; commission is taken from this. */
  rentalAmount: z.int(),
  deliveryFee: z.int(),
  depositAmount: z.int(),
  /** rentalAmount + deliveryFee + depositAmount, paid in one go (spec §4.6). */
  totalAmount: z.int(),
});

export type PriceLine = z.infer<typeof priceLineSchema>;
export type PriceQuote = z.infer<typeof priceQuoteSchema>;

export const QuoteErrorCode = {
  INVALID_RANGE: 'INVALID_RANGE',
  OFF_STEP: 'OFF_STEP',
  TOO_SHORT: 'TOO_SHORT',
  TOO_LONG: 'TOO_LONG',
  NO_PRICE: 'NO_PRICE',
  DELIVERY_UNAVAILABLE: 'DELIVERY_UNAVAILABLE',
  DELIVERY_TOO_FAR: 'DELIVERY_TOO_FAR',
} as const;
export type QuoteErrorCode = (typeof QuoteErrorCode)[keyof typeof QuoteErrorCode];

export type QuoteResult =
  | { ok: true; quote: PriceQuote }
  | { ok: false; code: QuoteErrorCode; message: string };

const fail = (code: QuoteErrorCode, message: string): QuoteResult => ({ ok: false, code, message });

/** `4 giờ`, `1 ngày`, `30 ngày` for rental length limits. */
const formatHours = (hours: number) =>
  hours % HOURS_PER_DAY === 0 ? `${hours / HOURS_PER_DAY} ngày` : `${vnNumber.format(hours)} giờ`;

/**
 * Prices a trip from `startAt` to `endAt`:
 * 1. Checks the times (after each other, on 30-minute steps) and the car's min/max length.
 * 2. Covers the length with the cheapest mix of months, days and hours turned on.
 * 3. Adds the weekend and holiday surcharges by share of hours (decided 2026-11-14): the
 *    rental price is spread evenly over every half hour, and a half hour on a Saturday,
 *    Sunday or public holiday in Vietnam carries that surcharge. A holiday on a weekend
 *    takes the higher of the two, not both.
 * 4. Takes off the long-rental discount for trips of 7 days or more, after surcharges.
 * 5. Adds the delivery fee and the deposit.
 *
 * It does not check availability, the 2-hour lead time or the 90-day booking window;
 * those depend on the current time and the calendar and belong to booking creation.
 */
export function quoteRental(input: QuoteInput): QuoteResult {
  const { pricing, startAt, endAt } = input;
  const startMs = startAt.getTime();
  const endMs = endAt.getTime();

  if (!(endMs > startMs)) {
    return fail(QuoteErrorCode.INVALID_RANGE, 'Giờ trả xe phải sau giờ nhận xe.');
  }
  if (startMs % SLOT_MS !== 0 || endMs % SLOT_MS !== 0) {
    return fail(
      QuoteErrorCode.OFF_STEP,
      `Giờ nhận và trả xe phải theo bước ${TIME_STEP_MINUTES} phút.`,
    );
  }
  const minutes = (endMs - startMs) / MINUTE_MS;
  if (minutes < pricing.minDurationHours * 60) {
    return fail(
      QuoteErrorCode.TOO_SHORT,
      `Xe cho thuê tối thiểu ${formatHours(pricing.minDurationHours)}.`,
    );
  }
  if (minutes > pricing.maxDurationDays * HOURS_PER_DAY * 60) {
    return fail(QuoteErrorCode.TOO_LONG, `Xe cho thuê tối đa ${pricing.maxDurationDays} ngày.`);
  }

  let delivery = 0;
  let deliveryLine: PriceLine | null = null;
  if (input.deliveryDistanceKm !== null) {
    if (input.delivery === null) {
      return fail(QuoteErrorCode.DELIVERY_UNAVAILABLE, 'Xe không hỗ trợ giao tận nơi.');
    }
    const fee = deliveryFee(input.delivery, input.deliveryDistanceKm);
    if (fee === null) {
      return fail(
        QuoteErrorCode.DELIVERY_TOO_FAR,
        `Xe chỉ giao trong bán kính ${input.delivery.maxRadiusKm} km.`,
      );
    }
    delivery = fee;
    const km = chargedKm(input.deliveryDistanceKm);
    const free = input.delivery.freeRadiusKm;
    deliveryLine = {
      code: PriceLineCode.DELIVERY,
      label: free > 0 ? `Giao xe ${km} km (miễn phí ${free} km đầu)` : `Giao xe ${km} km`,
      quantity: km,
      unitPrice: input.delivery.feePerKm,
      amount: fee,
    };
  }

  const split = cheapestUnits(pricing, minutes);
  if (split === null) {
    return fail(QuoteErrorCode.NO_PRICE, 'Xe chưa có bảng giá.');
  }
  const lines: PriceLine[] = [];
  const unitLines = [
    [PriceLineCode.RENTAL_MONTHS, split.months, pricing.monthlyPrice, 'tháng'],
    [PriceLineCode.RENTAL_DAYS, split.days, pricing.dailyPrice, 'ngày'],
    [PriceLineCode.RENTAL_HOURS, split.hours, pricing.hourlyPrice, 'giờ'],
  ] as const;
  for (const [code, quantity, unitPrice, unit] of unitLines) {
    if (quantity > 0 && unitPrice !== null) {
      lines.push({
        code,
        label: `Thuê ${vnNumber.format(quantity)} ${unit} × ${formatVnd(unitPrice)}`,
        quantity,
        unitPrice,
        amount: Math.round(quantity * unitPrice),
      });
    }
  }

  const base = lines.reduce((sum, line) => sum + line.amount, 0);

  // Surcharges, by share of the trip's half hours.
  const weekendPercent = pricing.weekendSurchargePercent ?? 0;
  const holidayPercent = pricing.holidaySurchargePercent ?? 0;
  const holidays = new Set(input.holidays);
  const slotCount = minutes / TIME_STEP_MINUTES;
  let weekendSlots = 0;
  let holidaySlots = 0;
  if (weekendPercent > 0 || holidayPercent > 0) {
    for (let slot = 0; slot < slotCount; slot += 1) {
      const { date, weekday } = vietnamDay(startMs + slot * SLOT_MS);
      const holiday = holidays.has(date) ? holidayPercent : 0;
      const weekend = isWeekend(weekday) ? weekendPercent : 0;
      if (holiday > 0 && holiday >= weekend) holidaySlots += 1;
      else if (weekend > 0) weekendSlots += 1;
    }
  }
  const surchargeLine = (
    code: PriceLineCode,
    name: string,
    percent: number,
    slots: number,
  ): PriceLine | null => {
    if (slots === 0) return null;
    const amount = roundToThousand((base * percent * slots) / (100 * slotCount));
    const hours = vnNumber.format(slots / SLOTS_PER_HOUR);
    return {
      code,
      label: `${name} ${percent}% (${hours} giờ)`,
      quantity: null,
      unitPrice: null,
      amount,
    };
  };
  const surcharges = [
    surchargeLine(
      PriceLineCode.WEEKEND_SURCHARGE,
      'Phụ phí cuối tuần',
      weekendPercent,
      weekendSlots,
    ),
    surchargeLine(PriceLineCode.HOLIDAY_SURCHARGE, 'Phụ phí ngày lễ', holidayPercent, holidaySlots),
  ].filter((line) => line !== null);
  lines.push(...surcharges);
  const beforeDiscount = base + surcharges.reduce((sum, line) => sum + line.amount, 0);

  // [Đề xuất] The long-rental discount applies to the whole rental after surcharges,
  // whatever the units, once the trip lasts 7 days (168 hours) or more.
  let discount = 0;
  const discountPercent = pricing.longRentalDiscountPercent;
  if (discountPercent !== null && minutes >= LONG_RENTAL_MIN_DAYS * HOURS_PER_DAY * 60) {
    discount = roundToThousand((beforeDiscount * discountPercent) / 100);
    if (discount > 0) {
      lines.push({
        code: PriceLineCode.LONG_RENTAL_DISCOUNT,
        label: `Giảm giá thuê từ ${LONG_RENTAL_MIN_DAYS} ngày (${discountPercent}%)`,
        quantity: null,
        unitPrice: null,
        amount: -discount,
      });
    }
  }

  if (deliveryLine) lines.push(deliveryLine);

  const rentalAmount = beforeDiscount - discount;
  return {
    ok: true,
    quote: {
      durationMinutes: minutes,
      lines,
      rentalAmount,
      deliveryFee: delivery,
      depositAmount: input.depositAmount,
      totalAmount: rentalAmount + delivery + input.depositAmount,
    },
  };
}
