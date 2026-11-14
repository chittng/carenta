import { describe, expect, it } from 'vitest';

import {
  addDays,
  formatDate,
  formatDateTime,
  formatDuration,
  formatTripTime,
  timeSlots,
  vietnamDate,
  vietnamDateTime,
  vietnamTime,
} from './time.js';

describe('Vietnam wall-clock time', () => {
  it('converts a Vietnam date and time to the UTC instant', () => {
    expect(vietnamDateTime('2026-11-20', '14:30').toISOString()).toBe('2026-11-20T07:30:00.000Z');
    // Early morning in Vietnam is still the previous day in UTC.
    expect(vietnamDateTime('2026-11-20', '00:00').toISOString()).toBe('2026-11-19T17:00:00.000Z');
  });

  it('reads the Vietnam date and time of an instant', () => {
    const instant = new Date('2026-11-19T17:30:00.000Z');
    expect(vietnamDate(instant)).toBe('2026-11-20');
    expect(vietnamTime(instant)).toBe('00:30');
  });

  it('round-trips through date and time', () => {
    const instant = new Date('2026-12-31T16:30:00.000Z');
    expect(vietnamDateTime(vietnamDate(instant), vietnamTime(instant))).toEqual(instant);
  });

  it('lists the 48 half-hour slots of a day', () => {
    const slots = timeSlots();
    expect(slots).toHaveLength(48);
    expect(slots.slice(0, 3)).toEqual(['00:00', '00:30', '01:00']);
    expect(slots.at(-1)).toBe('23:30');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('display formats', () => {
  const instant = vietnamDateTime('2026-11-20', '14:30');

  it('formats dates and times in Vietnam time', () => {
    expect(formatDate(instant)).toBe('20/11/2026');
    expect(formatDateTime(instant)).toBe('14:30 20/11/2026');
  });

  it('adds the weekday for trip times', () => {
    expect(formatTripTime(instant)).toBe('14:30 T6, 20/11/2026');
    expect(formatTripTime(vietnamDateTime('2026-11-22', '08:00'))).toBe('08:00 CN, 22/11/2026');
  });

  it('formats durations with the largest units first', () => {
    const minute = 60_000;
    expect(formatDuration(45 * minute)).toBe('45 phút');
    expect(formatDuration((2 * 24 * 60 + 3 * 60 + 30) * minute)).toBe('2 ngày 3 giờ 30 phút');
    expect(formatDuration(24 * 60 * minute)).toBe('1 ngày');
    expect(formatDuration(0)).toBe('0 phút');
  });
});
