import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ageOn,
  type DriverLicenseClass,
  type EligibilityInput,
  rentalEligibilityIssues,
  submitDriverLicenseSchema,
} from './index.js';

const trip = (overrides: Partial<EligibilityInput> = {}): EligibilityInput => ({
  license: {
    status: 'APPROVED',
    licenseClass: 'B',
    dateOfBirth: '1995-04-30',
    expiresOn: '2030-04-30',
  },
  car: { transmission: 'MANUAL', seats: 5 },
  pickupDate: '2026-11-20',
  returnDate: '2026-11-22',
  ...overrides,
});

const codes = (input: EligibilityInput) => rentalEligibilityIssues(input).map((i) => i.code);

describe('ageOn', () => {
  it.each([
    ['2008-11-20', '2026-11-20', 18],
    ['2008-11-21', '2026-11-20', 17],
    ['2008-12-01', '2026-11-20', 17],
    // A 29 February birthday counts on 1 March in other years.
    ['2008-02-29', '2026-02-28', 17],
    ['2008-02-29', '2026-03-01', 18],
  ])('born %s is %d on %s', (birth, date, age) => {
    expect(ageOn(birth, date)).toBe(age);
  });
});

describe('rentalEligibilityIssues', () => {
  it('lets an approved class B holder rent a 5-seat manual car', () => {
    expect(rentalEligibilityIssues(trip())).toEqual([]);
  });

  it('needs an approved license', () => {
    expect(rentalEligibilityIssues(trip({ license: null }))).toEqual([
      { code: 'NO_LICENSE', message: 'Bạn cần nộp GPLX và được duyệt trước khi đặt xe.' },
    ]);
    const license = trip().license!;
    expect(codes(trip({ license: { ...license, status: 'PENDING' } }))).toEqual([
      'LICENSE_NOT_APPROVED',
    ]);
    expect(rentalEligibilityIssues(trip({ license: { ...license, status: 'EXPIRED' } }))).toEqual([
      {
        code: 'LICENSE_NOT_APPROVED',
        message: 'GPLX của bạn đã hết hạn. Vui lòng nộp GPLX mới.',
      },
    ]);
  });

  it('needs the renter to be 18 on the pickup day', () => {
    const license = { ...trip().license!, dateOfBirth: '2008-11-21' };

    expect(codes(trip({ license }))).toEqual(['UNDER_AGE']);
    expect(codes(trip({ license, pickupDate: '2026-11-21', returnDate: '2026-11-22' }))).toEqual(
      [],
    );
  });

  it('limits the old B1 to automatic cars', () => {
    const license = { ...trip().license!, licenseClass: 'LEGACY_B1' as const };

    expect(rentalEligibilityIssues(trip({ license }))).toEqual([
      { code: 'AUTOMATIC_ONLY', message: 'GPLX hạng B1 cũ chỉ được lái xe số tự động.' },
    ]);
    expect(codes(trip({ license, car: { transmission: 'AUTOMATIC', seats: 7 } }))).toEqual([]);
  });

  it.each<[DriverLicenseClass, boolean]>([
    ['B', false],
    ['C1', false],
    ['C', false],
    ['LEGACY_B2', false],
    ['LEGACY_C', false],
    ['LEGACY_FC', false],
    ['D1', true],
    ['D2', true],
    ['D', true],
    ['DE', true],
    ['LEGACY_D', true],
    ['LEGACY_E', true],
    ['LEGACY_FD', true],
  ])('needs D1 or above for 10 seats or more: %s allowed %s', (licenseClass, allowed) => {
    const license = { ...trip().license!, licenseClass };

    expect(codes(trip({ license, car: { transmission: 'MANUAL', seats: 9 } }))).toEqual([]);
    expect(codes(trip({ license, car: { transmission: 'MANUAL', seats: 10 } }))).toEqual(
      allowed ? [] : ['CLASS_TOO_LOW'],
    );
  });

  it('needs the license valid through the return day', () => {
    const license = { ...trip().license!, expiresOn: '2026-11-22' };

    expect(codes(trip({ license }))).toEqual([]);
    expect(codes(trip({ license, returnDate: '2026-11-23' }))).toEqual(['EXPIRES_BEFORE_RETURN']);
  });

  it('lists every problem at once', () => {
    const license = {
      status: 'APPROVED' as const,
      licenseClass: 'LEGACY_B1' as const,
      dateOfBirth: '2009-01-01',
      expiresOn: '2026-11-21',
    };

    expect(codes(trip({ license, car: { transmission: 'MANUAL', seats: 16 } }))).toEqual([
      'UNDER_AGE',
      'AUTOMATIC_ONLY',
      'CLASS_TOO_LOW',
      'EXPIRES_BEFORE_RETURN',
    ]);
  });
});

describe('submitDriverLicenseSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const valid = {
    fullName: ' NGUYỄN VĂN A ',
    licenseNumber: '0123 4567 8901',
    licenseClass: 'B',
    dateOfBirth: '1995-04-30',
    expiresOn: '2030-04-30',
    frontUploadKey: 'f',
    backUploadKey: 'b',
  };

  it('trims the name and strips spaces from the number', () => {
    expect(submitDriverLicenseSchema.parse(valid)).toMatchObject({
      fullName: 'NGUYỄN VĂN A',
      licenseNumber: '012345678901',
    });
  });

  it.each([
    [{ licenseNumber: '12345' }, 'licenseNumber', 'Số GPLX gồm 12 chữ số.'],
    [{ licenseClass: 'A1' }, 'licenseClass', 'Hạng GPLX không hợp lệ.'],
    [{ dateOfBirth: '2008-11-15' }, 'dateOfBirth', 'Người thuê phải đủ 18 tuổi.'],
    [{ expiresOn: '2026-11-13' }, 'expiresOn', 'GPLX đã hết hạn.'],
  ])('refuses %j', (override, path, message) => {
    const result = submitDriverLicenseSchema.safeParse({ ...valid, ...override });

    expect(result.error?.issues[0]).toMatchObject({ path: [path], message });
  });

  it('accepts a license expiring today and a holder who turns 18 today', () => {
    expect(
      submitDriverLicenseSchema.safeParse({
        ...valid,
        dateOfBirth: '2008-11-14',
        expiresOn: '2026-11-14',
      }).success,
    ).toBe(true);
  });
});
