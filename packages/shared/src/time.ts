import { APP_TIME_ZONE } from './constants.js';

const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The calendar date in Vietnam at `now`, as `YYYY-MM-DD`. */
export function vietnamDate(now: Date = new Date()): string {
  return dateFormat.format(now);
}

/** The calendar year in Vietnam at `now`. */
export function vietnamYear(now: Date = new Date()): number {
  return Number(vietnamDate(now).slice(0, 4));
}
