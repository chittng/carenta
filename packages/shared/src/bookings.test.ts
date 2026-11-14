import { describe, expect, it } from 'vitest';

import {
  approvalDeadline,
  checkoutDeadline,
  createBookingSchema,
  paymentDeadline,
} from './index.js';

const now = new Date('2026-11-14T03:00:00Z');
const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

describe('booking deadlines', () => {
  it('caps the six-hour review window so there are thirty minutes to pay before pickup', () => {
    expect(approvalDeadline(now, at(24))).toEqual(at(6));
    expect(approvalDeadline(now, at(2))).toEqual(at(1.5));
    expect(approvalDeadline(now, at(6.5))).toEqual(at(6));
  });
  it('caps payment at thirty minutes or pickup, whichever comes first', () => {
    expect(paymentDeadline(now, at(24))).toEqual(at(0.5));
    expect(paymentDeadline(now, at(0.25))).toEqual(at(0.25));
  });
  it('never extends a payment deadline on checkout', () => {
    expect(checkoutDeadline(now, at(0.5))).toEqual(at(0.25));
    expect(checkoutDeadline(now, at(0.1))).toEqual(at(0.1));
  });
});

describe('createBookingSchema', () => {
  const input = {
    carId: 'a48ab558-63e0-49bc-abd1-692f78f5cde5',
    requestId: '3ca2137b-9e06-4d97-92e1-7ed82159fcb5',
    startAt: at(2).toISOString(),
    endAt: at(26).toISOString(),
    pickupMethod: 'SELF_PICKUP',
    termsAccepted: true,
  };
  it('allows an old payload to reach the server idempotency lookup and strips client amounts and status', () => {
    expect(createBookingSchema.parse({ ...input, totalAmount: 1, status: 'CONFIRMED' })).toEqual(
      input,
    );
  });
  it.each([
    [{ ...input, termsAccepted: false }, 'termsAccepted'],
    [{ ...input, requestId: undefined }, 'requestId'],
    [{ ...input, startAt: 'invalid' }, 'startAt'],
    [{ ...input, pickupMethod: 'DELIVERY' }, 'deliveryAddress'],
    [{ ...input, pickupMethod: 'DELIVERY', deliveryAddress: '1 Lê Lợi' }, 'deliveryLocation'],
    [
      {
        ...input,
        pickupMethod: 'DELIVERY',
        deliveryAddress: '1 Lê Lợi',
        deliveryLocation: { latitude: 0, longitude: 0 },
      },
      'deliveryLocation.latitude',
    ],
  ])('rejects invalid booking input: %j', (value, path) => {
    const result = createBookingSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path);
  });
});
