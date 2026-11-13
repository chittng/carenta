import { describe, expect, it } from 'vitest';

import { normalizeVietnamesePhone, responseRatePercent, updateProfileSchema } from './index.js';

describe('normalizeVietnamesePhone', () => {
  it.each([
    ['0912345678', '0912345678'],
    ['0912 345 678', '0912345678'],
    ['091.234.5678', '0912345678'],
    ['+84 912 345 678', '0912345678'],
    ['84912345678', '0912345678'],
    ['(+84) 32-123-4567', '0321234567'],
  ])('normalises %j to %s', (input, expected) => {
    expect(normalizeVietnamesePhone(input)).toBe(expected);
  });

  it.each(['', '091234567', '09123456789', '0212345678', '028 3822 1234', '+1 912 345 678', 'abc'])(
    'rejects %j',
    (input) => {
      expect(normalizeVietnamesePhone(input)).toBeNull();
    },
  );
});

describe('updateProfileSchema', () => {
  it('trims the name, normalises the phone and turns an empty phone into null', () => {
    expect(updateProfileSchema.parse({ fullName: ' Trần Thị B ', phone: '+84987654321' })).toEqual({
      fullName: 'Trần Thị B',
      phone: '0987654321',
    });
    expect(updateProfileSchema.parse({ phone: '  ' })).toEqual({ phone: null });
    expect(updateProfileSchema.parse({ phone: null })).toEqual({ phone: null });
    expect(updateProfileSchema.parse({})).toEqual({});
  });

  it('refuses an empty name', () => {
    const result = updateProfileSchema.safeParse({ fullName: '  ' });
    expect(result.error?.issues[0]?.message).toBe('Vui lòng nhập họ tên.');
  });
});

describe('responseRatePercent', () => {
  it('is the share of requests answered before the deadline, rounded', () => {
    expect(responseRatePercent(2, 1)).toBe(67);
    expect(responseRatePercent(5, 0)).toBe(100);
    expect(responseRatePercent(0, 3)).toBe(0);
  });

  it('is null without requests', () => {
    expect(responseRatePercent(0, 0)).toBeNull();
  });
});
