import { calendarBusyRanges, vietnamMonthRange } from './availability.js';

const range = (startAt: string, endAt: string) => ({
  startAt: new Date(startAt),
  endAt: new Date(endAt),
});

describe('Vietnam monthly calendar', () => {
  it.each([
    ['2026-11', '2026-10-31T17:00:00.000Z', '2026-11-30T17:00:00.000Z'],
    ['2026-12', '2026-11-30T17:00:00.000Z', '2026-12-31T17:00:00.000Z'],
    ['2027-02', '2027-01-31T17:00:00.000Z', '2027-02-28T17:00:00.000Z'],
    ['2028-02', '2028-01-31T17:00:00.000Z', '2028-02-29T17:00:00.000Z'],
  ])('uses local midnight at both ends of %s', (month, start, end) => {
    const window = vietnamMonthRange(month);
    expect(window.startAt.toISOString()).toBe(start);
    expect(window.endAt.toISOString()).toBe(end);
  });

  it('clips, sorts and merges nested, overlapping and touching intervals without mutating input', () => {
    const window = vietnamMonthRange('2026-11');
    const ranges = [
      range('2026-11-02T01:00Z', '2026-11-02T04:00Z'),
      range('2026-10-30T00:00Z', '2026-11-01T01:00Z'),
      range('2026-11-01T02:00Z', '2026-11-02T02:00Z'),
      range('2026-11-01T01:00Z', '2026-11-01T03:00Z'),
      range('2026-11-01T02:00Z', '2026-11-01T02:30Z'),
      range('2026-11-29T00:00Z', '2026-12-02T00:00Z'),
      range('2026-10-01T00:00Z', '2026-10-31T17:00Z'),
      range('2026-11-30T17:00Z', '2026-12-02T00:00Z'),
    ];
    const original = structuredClone(ranges);
    expect(calendarBusyRanges(ranges, window)).toEqual([
      { startAt: '2026-10-31T17:00:00.000Z', endAt: '2026-11-02T04:00:00.000Z' },
      { startAt: '2026-11-29T00:00:00.000Z', endAt: '2026-11-30T17:00:00.000Z' },
    ]);
    expect(ranges).toEqual(original);
    expect(calendarBusyRanges([], window)).toEqual([]);
  });
});
