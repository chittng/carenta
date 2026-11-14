import { type CarAvailability } from '@carenta/shared';

import { Prisma } from '../generated/prisma/client.js';

/** Keep in sync with the bookings_no_overlap exclusion constraint (spec §4.3). */
export const HOLDING_BOOKING_STATUSES = ['AWAITING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'] as const;

export interface TimeRange {
  startAt: Date;
  endAt: Date;
}

/** SQL fragments are trusted expressions supplied by the caller, never user input. */
export function noHoldingBookingOverlapSql(
  carId: Prisma.Sql,
  start: Prisma.Sql,
  blockedUntil: Prisma.Sql,
  excludeBookingId?: string,
): Prisma.Sql {
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM bookings bk
    WHERE bk.car_id = ${carId}
      AND bk.status::text IN (${Prisma.join([...HOLDING_BOOKING_STATUSES])})
      ${excludeBookingId ? Prisma.sql`AND bk.id <> ${excludeBookingId}::uuid` : Prisma.empty}
      AND tstzrange(bk.start_at, bk.blocked_until, '[)')
        && tstzrange(${start}, ${blockedUntil}, '[)')
  )`;
}

/** Owner blocks only cover pickup–return; the cleaning buffer separates trips only. */
export function freeForTripSql(
  carId: Prisma.Sql,
  start: Prisma.Sql,
  end: Prisma.Sql,
  blockedUntil: Prisma.Sql,
  excludeBookingId?: string,
): Prisma.Sql {
  return Prisma.sql`(
    NOT EXISTS (
      SELECT 1 FROM availability_blocks ab
      WHERE ab.car_id = ${carId} AND ab.start_at < ${end} AND ab.end_at > ${start}
    ) AND ${noHoldingBookingOverlapSql(carId, start, blockedUntil, excludeBookingId)}
  )`;
}

/** Bounds of a calendar month in Asia/Ho_Chi_Minh (UTC+7, no daylight saving). */
export function vietnamMonthRange(month: string): TimeRange {
  const midnight = new Date(`${month}-01T00:00:00Z`);
  const startAt = new Date(midnight.getTime() - 7 * 60 * 60_000);
  midnight.setUTCMonth(midnight.getUTCMonth() + 1);
  return { startAt, endAt: new Date(midnight.getTime() - 7 * 60 * 60_000) };
}

/** Clip to the month and merge touching/overlapping ranges without exposing their source. */
export function calendarBusyRanges(
  ranges: TimeRange[],
  window: TimeRange,
): CarAvailability['busy'] {
  const clipped = ranges
    .map((range) => ({
      start: Math.max(range.startAt.getTime(), window.startAt.getTime()),
      end: Math.min(range.endAt.getTime(), window.endAt.getTime()),
    }))
    .filter((range) => range.start < range.end)
    .toSorted((a, b) => a.start - b.start || a.end - b.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of clipped) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged.map((range) => ({
    startAt: new Date(range.start).toISOString(),
    endAt: new Date(range.end).toISOString(),
  }));
}
