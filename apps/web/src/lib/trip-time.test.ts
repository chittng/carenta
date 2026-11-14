import { describe, expect, it } from 'vitest';

import { vietnamDateTime } from '@carenta/shared';

import {
  earliestPickup,
  isUnavailableDay,
  overlapsBusy,
  pickupSlots,
  returnSlots,
  toBusyRanges,
  tripIssue,
} from './trip-time';

// 10:10 on Monday 16/11/2026 in Vietnam.
const now = vietnamDateTime('2026-11-16', '10:10');
const at = (date: string, time: string) => vietnamDateTime(date, time);

describe('earliestPickup', () => {
  it('is two hours ahead, rounded up to the 30-minute grid', () => {
    expect(earliestPickup(now)).toEqual(at('2026-11-16', '12:30'));
    expect(earliestPickup(at('2026-11-16', '10:00'))).toEqual(at('2026-11-16', '12:00'));
  });
});

describe('pickupSlots', () => {
  it('starts today at the earliest pickup', () => {
    const slots = pickupSlots('2026-11-16', [], now);
    expect(slots[0]).toBe('12:30');
    expect(slots.at(-1)).toBe('23:30');
  });

  it('offers the whole day later on', () => {
    expect(pickupSlots('2026-11-20', [], now)).toHaveLength(48);
  });

  it('leaves out busy times; the end of a busy range is free again', () => {
    const busy = [{ startAt: at('2026-11-20', '08:00'), endAt: at('2026-11-20', '18:00') }];
    const slots = pickupSlots('2026-11-20', busy, now);
    expect(slots).toContain('07:30');
    expect(slots).not.toContain('08:00');
    expect(slots).not.toContain('17:30');
    expect(slots).toContain('18:00');
  });

  it('stops at the 90-day booking horizon', () => {
    expect(pickupSlots('2027-02-14', [], now)).toEqual([
      '00:00',
      '00:30',
      '01:00',
      '01:30',
      '02:00',
      '02:30',
      '03:00',
      '03:30',
      '04:00',
      '04:30',
      '05:00',
      '05:30',
      '06:00',
      '06:30',
      '07:00',
      '07:30',
      '08:00',
      '08:30',
      '09:00',
      '09:30',
      '10:00',
    ]);
    expect(pickupSlots('2027-02-15', [], now)).toEqual([]);
  });
});

describe('returnSlots', () => {
  const startAt = at('2026-11-20', '09:00');

  it('starts after the pickup on the pickup day', () => {
    expect(returnSlots('2026-11-20', startAt, [])[0]).toBe('09:30');
  });

  it('ends where the next busy range begins', () => {
    const busy = [{ startAt: at('2026-11-22', '14:00'), endAt: at('2026-11-23', '10:00') }];
    const slots = returnSlots('2026-11-22', startAt, busy);
    expect(slots.at(-1)).toBe('14:00');
    expect(returnSlots('2026-11-23', startAt, busy)).toEqual([]);
  });
});

describe('isUnavailableDay', () => {
  it('blocks past days and keeps today if a slot is left', () => {
    expect(isUnavailableDay('2026-11-15', [], now)).toBe(true);
    expect(isUnavailableDay('2026-11-16', [], now)).toBe(false);
  });

  it('blocks a day that is busy from start to end', () => {
    const busy = [{ startAt: at('2026-11-19', '20:00'), endAt: at('2026-11-21', '06:00') }];
    expect(isUnavailableDay('2026-11-20', busy, now)).toBe(true);
    expect(isUnavailableDay('2026-11-19', busy, now)).toBe(false);
    expect(isUnavailableDay('2026-11-21', busy, now)).toBe(false);
  });

  it('keeps a day whose only usable time is a return at midnight', () => {
    const busy = [{ startAt: at('2026-11-25', '00:00'), endAt: at('2026-11-26', '00:00') }];
    // 00:00 on the 25th is free as a return (the trip ends as the busy range starts).
    expect(isUnavailableDay('2026-11-25', busy, now)).toBe(false);
  });

  it('allows return days past the pickup horizon', () => {
    expect(isUnavailableDay('2027-03-01', [], now)).toBe(false);
  });
});

describe('tripIssue', () => {
  const busy = toBusyRanges([
    {
      startAt: at('2026-11-21', '08:00').toISOString(),
      endAt: at('2026-11-21', '18:00').toISOString(),
    },
  ]);

  it('accepts a free trip', () => {
    expect(tripIssue(at('2026-11-18', '09:00'), at('2026-11-20', '09:00'), busy, now)).toBeNull();
  });

  it('rejects a trip that spans a busy range', () => {
    expect(tripIssue(at('2026-11-20', '09:00'), at('2026-11-22', '09:00'), busy, now)).toBe(
      'Xe đã có lịch trong khoảng thời gian này.',
    );
    expect(overlapsBusy(at('2026-11-21', '18:00'), at('2026-11-22', '09:00'), busy)).toBe(false);
  });

  it('applies the shared trip rules first', () => {
    expect(tripIssue(at('2026-11-16', '11:00'), at('2026-11-17', '09:00'), [], now)).toBe(
      'Giờ nhận xe phải cách hiện tại ít nhất 2 giờ.',
    );
  });
});
