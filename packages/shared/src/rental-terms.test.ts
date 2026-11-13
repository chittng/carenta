import { describe, expect, it } from 'vitest';

import {
  carDeliverySchema,
  carPricingSchema,
  effectiveLateFeePerHour,
  formatVnd,
  smallestUnitHours,
  updateCarSchema,
} from './index.js';

const pricing = (overrides: Record<string, unknown> = {}) => ({
  hourlyPrice: 100_000,
  dailyPrice: 800_000,
  monthlyPrice: 15_000_000,
  minDurationHours: 4,
  maxDurationDays: 30,
  ...overrides,
});

const issuesOf = (input: unknown) =>
  carPricingSchema
    .safeParse(input)
    .error?.issues.map((issue) => [issue.path.join('.'), issue.message]);

describe('formatVnd', () => {
  it('groups thousands with dots and adds đ', () => {
    expect(formatVnd(1_500_000)).toBe('1.500.000đ');
    expect(formatVnd(0)).toBe('0đ');
  });
});

describe('carPricingSchema', () => {
  it('fills optional surcharges, discount and late fee with null', () => {
    expect(carPricingSchema.parse(pricing())).toEqual({
      ...pricing(),
      weekendSurchargePercent: null,
      holidaySurchargePercent: null,
      longRentalDiscountPercent: null,
      lateFeePerHour: null,
    });
  });

  it('needs at least one price unit', () => {
    expect(issuesOf(pricing({ hourlyPrice: null, dailyPrice: null, monthlyPrice: null }))).toEqual([
      ['dailyPrice', 'Bật ít nhất một đơn vị giá: theo giờ, theo ngày hoặc theo tháng.'],
    ]);
  });

  it.each([
    [{ hourlyPrice: null }, 23, 24],
    [{ hourlyPrice: null, dailyPrice: null, lateFeePerHour: 200_000 }, 719, 720],
  ])(
    'keeps the minimum rental time to the smallest unit turned on (%j)',
    (units, tooShort, enough) => {
      const maxDurationDays = 60;
      expect(issuesOf(pricing({ ...units, maxDurationDays, minDurationHours: tooShort }))).toEqual([
        ['minDurationHours', expect.stringContaining('thời gian thuê tối thiểu phải từ')],
      ]);
      expect(issuesOf(pricing({ ...units, maxDurationDays, minDurationHours: enough }))).toBe(
        undefined,
      );
    },
  );

  it('refuses a minimum longer than the maximum', () => {
    expect(issuesOf(pricing({ minDurationHours: 31 * 24 }))).toEqual([
      ['minDurationHours', 'Thời gian thuê tối thiểu không được dài hơn thời gian thuê tối đa.'],
    ]);
  });

  it('refuses a long-rental discount the car can never reach', () => {
    expect(issuesOf(pricing({ maxDurationDays: 6, longRentalDiscountPercent: 10 }))).toEqual([
      [
        'longRentalDiscountPercent',
        'Giảm giá thuê dài áp dụng từ 7 ngày, nhưng xe chỉ cho thuê tối đa 6 ngày.',
      ],
    ]);
  });

  it('needs a late fee when there is no daily price', () => {
    expect(issuesOf(pricing({ dailyPrice: null }))).toEqual([
      ['lateFeePerHour', 'Xe không có giá theo ngày nên cần nhập phí trả trễ mỗi giờ.'],
    ]);
    expect(issuesOf(pricing({ dailyPrice: null, lateFeePerHour: 100_000 }))).toBe(undefined);
  });

  it.each([
    [{ dailyPrice: 99_000 }, 'dailyPrice', 'Giá theo ngày từ 100.000đ đến 50.000.000đ.'],
    [{ hourlyPrice: 125_500 }, 'hourlyPrice', 'Giá theo giờ phải tròn nghìn đồng.'],
    [{ dailyPrice: 800_000.5 }, 'dailyPrice', 'Giá theo ngày không hợp lệ.'],
    [
      { weekendSurchargePercent: 0 },
      'weekendSurchargePercent',
      'Phụ phí cuối tuần từ 1% đến 100%.',
    ],
    [
      { longRentalDiscountPercent: 60 },
      'longRentalDiscountPercent',
      'Giảm giá thuê dài từ 1% đến 50%.',
    ],
    [{ maxDurationDays: 181 }, 'maxDurationDays', 'Thời gian thuê tối đa không quá 180 ngày.'],
  ])('refuses %j', (override, path, message) => {
    expect(issuesOf(pricing(override))).toEqual([[path, message]]);
  });
});

describe('effectiveLateFeePerHour', () => {
  it("uses the owner's amount, or 10% of the daily price", () => {
    expect(effectiveLateFeePerHour({ dailyPrice: 850_000, lateFeePerHour: 120_000 })).toBe(120_000);
    expect(effectiveLateFeePerHour({ dailyPrice: 855_000, lateFeePerHour: null })).toBe(85_500);
  });

  it('cannot default without a daily price', () => {
    expect(() => effectiveLateFeePerHour({ dailyPrice: null, lateFeePerHour: null })).toThrow(
      'A car without a daily price must set its late fee',
    );
  });
});

describe('smallestUnitHours', () => {
  it('is an hour, a day or a 30-day month', () => {
    const none = { hourlyPrice: null, dailyPrice: null, monthlyPrice: null };
    expect(smallestUnitHours({ ...none, hourlyPrice: 1, monthlyPrice: 1 })).toBe(1);
    expect(smallestUnitHours({ ...none, dailyPrice: 1, monthlyPrice: 1 })).toBe(24);
    expect(smallestUnitHours({ ...none, monthlyPrice: 1 })).toBe(720);
  });
});

describe('carDeliverySchema', () => {
  it('accepts free delivery within the radius', () => {
    const delivery = { maxRadiusKm: 10, feePerKm: 0, freeRadiusKm: 10 };
    expect(carDeliverySchema.parse(delivery)).toEqual(delivery);
  });

  it('refuses a free radius beyond the delivery radius', () => {
    const result = carDeliverySchema.safeParse({
      maxRadiusKm: 5,
      feePerKm: 5_000,
      freeRadiusKm: 6,
    });
    expect(result.error?.issues[0]).toMatchObject({
      path: ['freeRadiusKm'],
      message: 'Số km miễn phí không được lớn hơn bán kính giao xe.',
    });
  });
});

describe('rental settings on a car', () => {
  it.each([
    [{ depositAmount: 51_000_000 }, 'depositAmount'],
    [{ depositAmount: -1_000 }, 'depositAmount'],
    [{ bufferMinutes: 45 }, 'bufferMinutes'],
    [{ bufferMinutes: 1_470 }, 'bufferMinutes'],
    [{ delivery: { maxRadiusKm: 51, feePerKm: 5_000, freeRadiusKm: 0 } }, 'delivery.maxRadiusKm'],
  ])('refuses %j', (input, path) => {
    const result = updateCarSchema.safeParse(input);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([path]);
  });

  it('accepts no deposit, no buffer and turning delivery off', () => {
    const input = { depositAmount: 0, bufferMinutes: 0, delivery: null, instantBook: true };
    expect(updateCarSchema.parse(input)).toEqual(input);
  });
});
