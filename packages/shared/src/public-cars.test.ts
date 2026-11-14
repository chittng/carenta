import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { carQuoteInputSchema, maskLicensePlate } from './index.js';

describe('maskLicensePlate', () => {
  it.each([
    ['51K-123.45', '51K-***.45'],
    ['51ld 98765', '51LD-***.65'],
    ['30A-1234', '30A-**34'],
    ['private text', '***'],
    ['', '***'],
  ])('masks %s as %s', (plate, expected) => {
    expect(maskLicensePlate(plate)).toBe(expected);
  });
});

describe('carQuoteInputSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const input = {
    startAt: '2026-11-14T12:00:00+07:00',
    endAt: '2026-11-15T12:30:00+07:00',
    pickupMethod: 'SELF_PICKUP',
  };
  const delivery = {
    ...input,
    pickupMethod: 'DELIVERY',
    deliveryLocation: { latitude: 10.77, longitude: 106.7 },
  };

  it('accepts pickup or delivery and removes client-supplied prices and distances', () => {
    expect(carQuoteInputSchema.parse(input)).toEqual(input);
    expect(
      carQuoteInputSchema.parse({ ...delivery, totalAmount: 1, deliveryDistanceKm: 0 }),
    ).toEqual(delivery);
  });

  it.each([
    [{ ...input, pickupMethod: 'UNKNOWN' }, 'pickupMethod'],
    [{ ...input, pickupMethod: 'DELIVERY' }, 'deliveryLocation'],
    [
      { ...delivery, deliveryLocation: { latitude: 7, longitude: 106.7 } },
      'deliveryLocation.latitude',
    ],
    [
      { ...delivery, deliveryLocation: { latitude: 10.77, longitude: 111 } },
      'deliveryLocation.longitude',
    ],
    [
      { ...delivery, deliveryLocation: { latitude: '10.77', longitude: 106.7 } },
      'deliveryLocation.latitude',
    ],
    [{ ...input, startAt: 'invalid' }, 'startAt'],
    [{ ...input, endAt: input.startAt }, 'endAt'],
    [{ ...input, startAt: '2026-11-14T12:15:00+07:00' }, 'startAt'],
    [{ ...input, startAt: '2026-11-14T11:30:00+07:00' }, 'startAt'],
    [
      { ...input, startAt: '2027-03-01T12:00:00+07:00', endAt: '2027-03-02T12:00:00+07:00' },
      'startAt',
    ],
  ])('rejects invalid quote inputs without throwing in refinement: %j', (value, path) => {
    const result = carQuoteInputSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path);
  });
});
