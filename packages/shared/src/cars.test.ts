import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCarSchema,
  normalizeLicensePlate,
  putCarDocumentSchema,
  reorderCarPhotosSchema,
  updateCarSchema,
  vietnamDate,
  vietnamYear,
} from './index.js';

describe('normalizeLicensePlate', () => {
  it.each([
    ['51K-123.45', '51K-123.45'],
    ['51k12345', '51K-123.45'],
    [' 51K 123 45 ', '51K-123.45'],
    ['30A-1234', '30A-1234'],
    ['51LD-012.34', '51LD-012.34'],
    ['29a.99999', '29A-999.99'],
  ])('normalises %j to %s', (input, expected) => {
    expect(normalizeLicensePlate(input)).toBe(expected);
  });

  it.each(['', '51-123.45', '5K-123.45', '51K-123', '51K-123456', '51ABC-123.45', 'NG-123.45'])(
    'rejects %j',
    (input) => {
      expect(normalizeLicensePlate(input)).toBeNull();
    },
  );
});

describe('vietnamDate', () => {
  it('uses the Vietnam calendar day, not UTC', () => {
    // 17:30 UTC on 31 Dec is already 00:30 on 1 Jan in Vietnam (UTC+7).
    const now = new Date('2026-12-31T17:30:00Z');
    expect(vietnamDate(now)).toBe('2027-01-01');
    expect(vietnamYear(now)).toBe(2027);
  });
});

describe('createCarSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const valid = {
    modelId: 1,
    year: 2022,
    licensePlate: '51k 123.45',
    color: ' Trắng ',
    bodyType: 'SEDAN',
    seats: 5,
    transmission: 'AUTOMATIC',
    fuelType: 'GASOLINE',
    odometerKm: 25_000,
    location: {
      province: 'TP. Hồ Chí Minh',
      ward: 'Phường Bến Thành',
      addressLine: '12 Lê Lợi',
      latitude: 10.7721,
      longitude: 106.6983,
    },
  };

  it('accepts the basic details and normalises them', () => {
    const car = createCarSchema.parse({ ...valid, fuelConsumption: 6.25, description: '  ' });

    expect(car).toMatchObject({ licensePlate: '51K-123.45', color: 'Trắng', description: null });
    expect(car.fuelConsumption).toBe(6.3);
  });

  it('requires the address up front', () => {
    const { location: _location, ...withoutLocation } = valid;
    const result = createCarSchema.safeParse(withoutLocation);

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['location']);
  });

  it.each([
    [{ year: 1989 }, 'year', 'Năm sản xuất phải từ 1990 trở đi.'],
    [{ year: 2028 }, 'year', 'Năm sản xuất không hợp lệ.'],
    [{ seats: 17 }, 'seats', 'Số chỗ từ 2 đến 16.'],
    [{ licensePlate: '51K-12' }, 'licensePlate', 'Biển số không hợp lệ. Ví dụ: 51K-123.45'],
    [{ amenityIds: [1, 1] }, 'amenityIds', 'Tiện nghi bị trùng.'],
    [
      { location: { ...valid.location, latitude: 35.68, longitude: 139.69 } },
      'location.latitude',
      'Vị trí phải nằm ở Việt Nam.',
    ],
    [
      { mileageLimit: { dailyKm: 300, extraFeePerKm: 0 } },
      'mileageLimit.extraFeePerKm',
      'Phụ phí mỗi km vượt phải lớn hơn 0.',
    ],
  ])('rejects %j', (override, path, message) => {
    const result = createCarSchema.safeParse({ ...valid, ...override });

    expect(result.error?.issues[0]).toMatchObject({ path: path.split('.'), message });
  });

  it('accepts next year as the model year', () => {
    expect(createCarSchema.safeParse({ ...valid, year: 2027 }).success).toBe(true);
  });
});

describe('updateCarSchema', () => {
  it('accepts any subset of fields and null to clear optional ones', () => {
    expect(updateCarSchema.parse({})).toEqual({});
    expect(updateCarSchema.parse({ mileageLimit: null, description: null })).toEqual({
      mileageLimit: null,
      description: null,
    });
  });
});

describe('putCarDocumentSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 14 Nov in Vietnam
    vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts an inspection valid until today or later', () => {
    expect(
      putCarDocumentSchema.safeParse({ uploadKey: 'k', expiresOn: '2026-11-14' }).success,
    ).toBe(true);
  });

  it('rejects an expired inspection', () => {
    const result = putCarDocumentSchema.safeParse({ uploadKey: 'k', expiresOn: '2026-11-13' });

    expect(result.error?.issues[0]?.message).toBe('Giấy tờ đã hết hạn.');
  });
});

describe('reorderCarPhotosSchema', () => {
  it('rejects duplicated photos', () => {
    const id = '0195f0b6-0000-7000-8000-000000000001';
    const result = reorderCarPhotosSchema.safeParse({ photoIds: [id, id] });

    expect(result.error?.issues[0]?.message).toBe('Ảnh bị trùng.');
  });
});
