import { describe, expect, it } from 'vitest';

import {
  cheapestUnits,
  chargedKm,
  deliveryFee,
  distanceKm,
  type PriceQuote,
  type QuoteInput,
  type QuotePricing,
  quoteRental,
} from './index.js';

/** An instant given as Vietnam local time, e.g. `vn('2026-11-16 09:00')`. */
const vn = (local: string) => new Date(`${local.replace(' ', 'T')}:00+07:00`);

// The week used below: Fri 13, Sat 14, Sun 15, Mon 16 ... Fri 20 November 2026.
const pricing = (overrides: Partial<QuotePricing> = {}): QuotePricing => ({
  hourlyPrice: 100_000,
  dailyPrice: 800_000,
  monthlyPrice: null,
  minDurationHours: 1,
  maxDurationDays: 60,
  weekendSurchargePercent: null,
  holidaySurchargePercent: null,
  longRentalDiscountPercent: null,
  ...overrides,
});

const input = (
  start: string,
  end: string,
  overrides: Partial<QuoteInput> = {},
  pricingOverrides: Partial<QuotePricing> = {},
): QuoteInput => ({
  pricing: pricing(pricingOverrides),
  depositAmount: 5_000_000,
  delivery: null,
  startAt: vn(start),
  endAt: vn(end),
  holidays: [],
  deliveryDistanceKm: null,
  ...overrides,
});

function quote(...args: Parameters<typeof input>): PriceQuote {
  const result = quoteRental(input(...args));
  if (!result.ok) throw new Error(`Expected a quote, got ${result.code}: ${result.message}`);
  return result.quote;
}

const linesOf = (q: PriceQuote) => q.lines.map((line) => [line.code, line.quantity, line.amount]);

describe('quoteRental: units', () => {
  it('charges hours, with a half hour at half the hourly price', () => {
    const q = quote('2026-11-16 09:00', '2026-11-16 13:30');

    expect(q.lines).toEqual([
      {
        code: 'RENTAL_HOURS',
        label: 'Thuê 4,5 giờ × 100.000đ',
        quantity: 4.5,
        unitPrice: 100_000,
        amount: 450_000,
      },
    ]);
    expect(q).toMatchObject({
      durationMinutes: 270,
      rentalAmount: 450_000,
      deliveryFee: 0,
      depositAmount: 5_000_000,
      totalAmount: 5_450_000,
    });
  });

  it('charges a whole day once the hours cost as much as a day', () => {
    expect(linesOf(quote('2026-11-16 09:00', '2026-11-16 16:30'))).toEqual([
      ['RENTAL_HOURS', 7.5, 750_000],
    ]);
    // 8 hours cost the same as a day: the bigger unit wins.
    expect(linesOf(quote('2026-11-16 09:00', '2026-11-16 17:00'))).toEqual([
      ['RENTAL_DAYS', 1, 800_000],
    ]);
    expect(linesOf(quote('2026-11-16 09:00', '2026-11-16 21:00'))).toEqual([
      ['RENTAL_DAYS', 1, 800_000],
    ]);
  });

  it('charges exactly 24 hours overnight as one day', () => {
    expect(linesOf(quote('2026-11-16 18:00', '2026-11-17 18:00'))).toEqual([
      ['RENTAL_DAYS', 1, 800_000],
    ]);
  });

  it('mixes days and hours, or rounds up when there is no hourly price', () => {
    expect(linesOf(quote('2026-11-16 08:00', '2026-11-17 10:00'))).toEqual([
      ['RENTAL_DAYS', 1, 800_000],
      ['RENTAL_HOURS', 2, 200_000],
    ]);
    expect(
      linesOf(
        quote(
          '2026-11-16 08:00',
          '2026-11-17 10:00',
          {},
          { hourlyPrice: null, minDurationHours: 24 },
        ),
      ),
    ).toEqual([['RENTAL_DAYS', 2, 1_600_000]]);
  });

  it('uses a 30-day month when it is cheaper', () => {
    const monthly = { monthlyPrice: 15_000_000 };

    expect(linesOf(quote('2026-11-16 09:00', '2026-12-17 09:00', {}, monthly))).toEqual([
      ['RENTAL_MONTHS', 1, 15_000_000],
      ['RENTAL_DAYS', 1, 800_000],
    ]);
    // 20 days cost 16.000.000đ by the day, more than a month.
    expect(linesOf(quote('2026-11-16 09:00', '2026-12-06 09:00', {}, monthly))).toEqual([
      ['RENTAL_MONTHS', 1, 15_000_000],
    ]);
  });

  it('rounds up to whole months when only a monthly price is set', () => {
    const onlyMonthly = {
      hourlyPrice: null,
      dailyPrice: null,
      monthlyPrice: 15_000_000,
      minDurationHours: 720,
    };

    expect(linesOf(quote('2026-11-16 09:00', '2026-12-31 09:00', {}, onlyMonthly))).toEqual([
      ['RENTAL_MONTHS', 2, 30_000_000],
    ]);
  });

  it('is never dearer than any single unit, and the lines add up', () => {
    const start = vn('2026-11-16 00:00');
    for (let halfHours = 2; halfHours <= 24 * 2 * 4; halfHours += 1) {
      const end = new Date(start.getTime() + halfHours * 30 * 60_000);
      const both = quoteRental({ ...input('2026-11-16 00:00', '2026-11-16 00:30'), endAt: end });
      const hourly = cheapestUnits(
        { hourlyPrice: 100_000, dailyPrice: null, monthlyPrice: null },
        halfHours * 30,
      );
      const daily = cheapestUnits(
        { hourlyPrice: null, dailyPrice: 800_000, monthlyPrice: null },
        halfHours * 30,
      );

      expect(both.ok).toBe(true);
      if (!both.ok) continue;
      expect(both.quote.rentalAmount).toBeLessThanOrEqual(Math.min(hourly!.amount, daily!.amount));
      expect(both.quote.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(
        both.quote.rentalAmount,
      );
    }
  });
});

describe('quoteRental: surcharges', () => {
  it('charges the weekend share of the rental, by hours in Vietnam time', () => {
    // Fri 14:00 to Sun 14:00: 38 of 48 hours fall on the weekend.
    const q = quote('2026-11-13 14:00', '2026-11-15 14:00', {}, { weekendSurchargePercent: 10 });

    expect(q.lines.at(-1)).toEqual({
      code: 'WEEKEND_SURCHARGE',
      label: 'Phụ phí cuối tuần 10% (38 giờ)',
      quantity: null,
      unitPrice: null,
      // 1.600.000 × 10% × 38/48 = 126.666,67 → nearest 1.000đ
      amount: 127_000,
    });
    expect(q.rentalAmount).toBe(1_727_000);
  });

  it('starts the weekend at midnight in Vietnam, not UTC', () => {
    // Fri 20:00 to Sat 02:00 in Vietnam is entirely Friday in UTC.
    const q = quote('2026-11-13 20:00', '2026-11-14 02:00', {}, { weekendSurchargePercent: 20 });

    expect(linesOf(q)).toEqual([
      ['RENTAL_HOURS', 6, 600_000],
      // 600.000 × 20% × 2/6
      ['WEEKEND_SURCHARGE', null, 40_000],
    ]);
  });

  it('charges public holidays, taking the higher rate when one falls on a weekend', () => {
    // 30/4 (Thursday) to 3/5 (Sunday) 2026 are public holidays.
    const holidays = ['2026-04-30', '2026-05-01', '2026-05-02', '2026-05-03'];
    const rates = { weekendSurchargePercent: 10, holidaySurchargePercent: 30 };

    expect(linesOf(quote('2026-05-02 00:00', '2026-05-03 00:00', { holidays }, rates))).toEqual([
      ['RENTAL_DAYS', 1, 800_000],
      ['HOLIDAY_SURCHARGE', null, 240_000],
    ]);
    expect(
      linesOf(
        quote(
          '2026-05-02 00:00',
          '2026-05-03 00:00',
          { holidays },
          {
            ...rates,
            weekendSurchargePercent: 40,
          },
        ),
      ),
    ).toEqual([
      ['RENTAL_DAYS', 1, 800_000],
      ['WEEKEND_SURCHARGE', null, 320_000],
    ]);
    // Wed 12:00 to Thu 12:00: half on a weekday, half on the 30/4 holiday.
    expect(linesOf(quote('2026-04-29 12:00', '2026-04-30 12:00', { holidays }, rates))).toEqual([
      ['RENTAL_DAYS', 1, 800_000],
      ['HOLIDAY_SURCHARGE', null, 120_000],
    ]);
  });

  it('adds nothing without surcharge rates', () => {
    const holidays = ['2026-11-14'];

    expect(linesOf(quote('2026-11-14 00:00', '2026-11-15 00:00', { holidays }))).toEqual([
      ['RENTAL_DAYS', 1, 800_000],
    ]);
  });
});

describe('quoteRental: long-rental discount', () => {
  const discount = { longRentalDiscountPercent: 10, hourlyPrice: null, minDurationHours: 24 };

  it('applies from exactly 7 days', () => {
    const q = quote('2026-11-16 00:00', '2026-11-23 00:00', {}, discount);

    expect(linesOf(q)).toEqual([
      ['RENTAL_DAYS', 7, 5_600_000],
      ['LONG_RENTAL_DISCOUNT', null, -560_000],
    ]);
    expect(q.lines.at(-1)?.label).toBe('Giảm giá thuê từ 7 ngày (10%)');
    expect(q.rentalAmount).toBe(5_040_000);
  });

  it('does not apply half an hour short of 7 days, even when charged as 7 days', () => {
    expect(linesOf(quote('2026-11-16 00:00', '2026-11-22 23:30', {}, discount))).toEqual([
      ['RENTAL_DAYS', 7, 5_600_000],
    ]);
  });

  it('is taken after the surcharges', () => {
    const q = quote(
      '2026-11-16 00:00',
      '2026-11-23 00:00',
      {},
      {
        ...discount,
        weekendSurchargePercent: 10,
      },
    );

    expect(linesOf(q)).toEqual([
      ['RENTAL_DAYS', 7, 5_600_000],
      // 48 of 168 hours on the weekend
      ['WEEKEND_SURCHARGE', null, 160_000],
      ['LONG_RENTAL_DISCOUNT', null, -576_000],
    ]);
    expect(q.rentalAmount).toBe(5_184_000);
  });
});

describe('quoteRental: delivery', () => {
  const delivery = { maxRadiusKm: 10, feePerKm: 10_000, freeRadiusKm: 3 };

  it('charges each km beyond the free ones, rounded up to a whole km', () => {
    const q = quote('2026-11-16 09:00', '2026-11-16 13:00', { delivery, deliveryDistanceKm: 7.2 });

    expect(q.lines.at(-1)).toEqual({
      code: 'DELIVERY',
      label: 'Giao xe 8 km (miễn phí 3 km đầu)',
      quantity: 8,
      unitPrice: 10_000,
      amount: 50_000,
    });
    expect(q).toMatchObject({
      rentalAmount: 400_000,
      deliveryFee: 50_000,
      totalAmount: 5_450_000,
    });
  });

  it('refuses addresses beyond the radius, and cars that do not deliver', () => {
    expect(
      quoteRental(
        input('2026-11-16 09:00', '2026-11-16 13:00', { delivery, deliveryDistanceKm: 10.2 }),
      ),
    ).toEqual({
      ok: false,
      code: 'DELIVERY_TOO_FAR',
      message: 'Xe chỉ giao trong bán kính 10 km.',
    });
    expect(
      quoteRental(input('2026-11-16 09:00', '2026-11-16 13:00', { deliveryDistanceKm: 1 })),
    ).toMatchObject({ ok: false, code: 'DELIVERY_UNAVAILABLE' });
  });

  it.each([
    [0, 0],
    [3, 0],
    [3.01, 10_000],
    [5.000_000_000_1, 20_000],
    [10, 70_000],
  ])('charges %d km as %d đ', (km, fee) => {
    expect(deliveryFee(delivery, km)).toBe(fee);
  });

  it('measures straight-line distance', () => {
    // One degree of longitude at the equator is about 111,19 km.
    expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(
      111.19,
      1,
    );
    // Hồ Gươm to Nhà thờ Lớn Hà Nội, about 0,35 km: charged as 1 km.
    const km = distanceKm(
      { latitude: 21.0287, longitude: 105.8524 },
      { latitude: 21.0287, longitude: 105.849 },
    );
    expect(chargedKm(km)).toBe(1);
  });
});

describe('quoteRental: refusals', () => {
  it.each([
    ['2026-11-16 13:00', '2026-11-16 09:00', 'INVALID_RANGE', 'Giờ trả xe phải sau giờ nhận xe.'],
    ['2026-11-16 09:00', '2026-11-16 09:00', 'INVALID_RANGE', 'Giờ trả xe phải sau giờ nhận xe.'],
    [
      '2026-11-16 09:15',
      '2026-11-16 13:00',
      'OFF_STEP',
      'Giờ nhận và trả xe phải theo bước 30 phút.',
    ],
  ])('refuses %s → %s', (start, end, code, message) => {
    expect(quoteRental(input(start, end))).toEqual({ ok: false, code, message });
  });

  it('enforces the minimum and maximum rental time', () => {
    expect(
      quoteRental(input('2026-11-16 09:00', '2026-11-16 12:30', {}, { minDurationHours: 4 })),
    ).toEqual({ ok: false, code: 'TOO_SHORT', message: 'Xe cho thuê tối thiểu 4 giờ.' });
    expect(
      quoteRental(input('2026-11-16 09:00', '2026-11-17 08:30', {}, { minDurationHours: 24 })),
    ).toMatchObject({ code: 'TOO_SHORT', message: 'Xe cho thuê tối thiểu 1 ngày.' });
    expect(
      quoteRental(input('2026-11-16 09:00', '2026-11-17 09:00', {}, { minDurationHours: 24 })).ok,
    ).toBe(true);
    expect(
      quoteRental(input('2026-11-16 09:00', '2026-11-19 09:30', {}, { maxDurationDays: 3 })),
    ).toEqual({ ok: false, code: 'TOO_LONG', message: 'Xe cho thuê tối đa 3 ngày.' });
  });

  it('needs at least one price', () => {
    expect(
      quoteRental(
        input('2026-11-16 09:00', '2026-11-16 13:00', {}, { hourlyPrice: null, dailyPrice: null }),
      ),
    ).toMatchObject({ ok: false, code: 'NO_PRICE' });
  });
});
