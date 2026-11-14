import {
  addDays,
  BOOKING_HORIZON_DAYS,
  HOURS_PER_DAY,
  MAX_RENTAL_DAYS_LIMIT,
  PICKUP_MIN_LEAD_HOURS,
  TIME_STEP_MINUTES,
  timeSlots,
  tripWindowIssue,
  vietnamDate,
  vietnamDateTime,
} from '@carenta/shared';

/**
 * Pure rules behind the pickup/return picker. Times are Vietnam wall-clock dates
 * (`YYYY-MM-DD`) and slots (`HH:mm`); the API checks everything again when quoting and
 * booking, so these only keep the renter from picking times that cannot work.
 */

/** A busy range from the car's calendar, `[startAt, endAt)`, buffer included by the API. */
export interface BusyRange {
  startAt: Date;
  endAt: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const STEP_MS = TIME_STEP_MINUTES * 60 * 1000;
const SLOTS = timeSlots();

/** Parses the API's `{ startAt, endAt }` strings. */
export function toBusyRanges(busy: readonly { startAt: string; endAt: string }[]): BusyRange[] {
  return busy.map((range) => ({ startAt: new Date(range.startAt), endAt: new Date(range.endAt) }));
}

/** Earliest pickup allowed at `now`: two hours ahead, rounded up to the 30-minute grid. */
export function earliestPickup(now: Date): Date {
  const min = now.getTime() + PICKUP_MIN_LEAD_HOURS * HOUR_MS;
  return new Date(Math.ceil(min / STEP_MS) * STEP_MS);
}

export function latestPickup(now: Date): Date {
  return new Date(now.getTime() + BOOKING_HORIZON_DAYS * HOURS_PER_DAY * HOUR_MS);
}

function isInsideBusy(instant: Date, busy: readonly BusyRange[]): boolean {
  const t = instant.getTime();
  return busy.some((range) => range.startAt.getTime() <= t && t < range.endAt.getTime());
}

/** Whether `[startAt, endAt)` overlaps any busy range. */
export function overlapsBusy(startAt: Date, endAt: Date, busy: readonly BusyRange[]): boolean {
  return busy.some(
    (range) =>
      range.startAt.getTime() < endAt.getTime() && startAt.getTime() < range.endAt.getTime(),
  );
}

/** Pickup slots of `date` that are in the booking window and not busy. */
export function pickupSlots(date: string, busy: readonly BusyRange[], now: Date): string[] {
  const earliest = earliestPickup(now).getTime();
  const latest = latestPickup(now).getTime();
  return SLOTS.filter((slot) => {
    const instant = vietnamDateTime(date, slot);
    const t = instant.getTime();
    return t >= earliest && t <= latest && !isInsideBusy(instant, busy);
  });
}

/**
 * Return slots of `date` for a trip starting at `startAt`: after the pickup, within the
 * longest trip any car allows, and before the next busy range.
 */
export function returnSlots(date: string, startAt: Date, busy: readonly BusyRange[]): string[] {
  const start = startAt.getTime();
  const longest = start + MAX_RENTAL_DAYS_LIMIT * HOURS_PER_DAY * HOUR_MS;
  return SLOTS.filter((slot) => {
    const end = vietnamDateTime(date, slot);
    const t = end.getTime();
    return t > start && t <= longest && !overlapsBusy(startAt, end, busy);
  });
}

/** A return at `instant` is blocked when the moment just before it is busy. */
function isReturnBlocked(instant: Date, busy: readonly BusyRange[]): boolean {
  const t = instant.getTime();
  return busy.some((range) => range.startAt.getTime() < t && t <= range.endAt.getTime());
}

/**
 * Whether `date` can be neither a pickup day nor a return day: in the past, beyond the
 * furthest possible return, or busy all day. Days in between can still be partly busy;
 * the time lists and `tripIssue` handle that.
 */
export function isUnavailableDay(date: string, busy: readonly BusyRange[], now: Date): boolean {
  const today = vietnamDate(now);
  if (date < today) return true;
  if (date > addDays(today, BOOKING_HORIZON_DAYS + MAX_RENTAL_DAYS_LIMIT)) return true;
  if (pickupSlots(date, busy, now).length > 0) return false;
  const earliest = earliestPickup(now).getTime();
  return !SLOTS.some((slot) => {
    const instant = vietnamDateTime(date, slot);
    return instant.getTime() > earliest && !isReturnBlocked(instant, busy);
  });
}

/**
 * The first problem with a picked trip, or null: the shared trip rules (grid, lead time,
 * horizon, longest trip), then the car's calendar.
 */
export function tripIssue(
  startAt: Date,
  endAt: Date,
  busy: readonly BusyRange[],
  now: Date,
): string | null {
  const issue = tripWindowIssue(startAt, endAt, now);
  if (issue) return issue.message;
  if (overlapsBusy(startAt, endAt, busy)) return 'Xe đã có lịch trong khoảng thời gian này.';
  return null;
}
