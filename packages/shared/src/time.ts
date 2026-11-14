import { APP_TIME_ZONE, TIME_STEP_MINUTES } from './constants.js';

const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The calendar date in Vietnam at `now`, as `YYYY-MM-DD`. */
export function vietnamDate(now: Date = new Date()): string {
  return dateFormat.format(now);
}

/** The calendar year in Vietnam at `now`. */
export function vietnamYear(now: Date = new Date()): number {
  return Number(vietnamDate(now).slice(0, 4));
}

/** The wall-clock time in Vietnam at `instant`, as `HH:mm`. */
export function vietnamTime(instant: Date): string {
  return timeFormat.format(instant);
}

/**
 * Vietnam has used UTC+7 all year since 1975 (no daylight saving), so a fixed offset turns
 * its wall-clock time into an instant exactly.
 */
const VIETNAM_UTC_OFFSET = '+07:00';

/** The instant of a wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`) in Vietnam. */
export function vietnamDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${VIETNAM_UTC_OFFSET}`);
}

/** Every pickup/return time of day on the 30-minute grid: `00:00`, `00:30`, …, `23:30`. */
export function timeSlots(): string[] {
  const slots: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += TIME_STEP_MINUTES) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

/** Adds whole days to a `YYYY-MM-DD` calendar date. */
export function addDays(date: string, days: number): string {
  const utc = new Date(`${date}T00:00:00Z`);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

// ─── Display (Vietnamese, always in Vietnam time) ──────────────────────────────

// Weekday names are mapped by hand: ICU versions (Node vs. browsers) disagree on vi-VN
// abbreviations, which would make server and client renders differ.
const weekdayIndex = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  weekday: 'short',
});
const WEEKDAYS: Record<string, string> = {
  Sun: 'CN',
  Mon: 'T2',
  Tue: 'T3',
  Wed: 'T4',
  Thu: 'T5',
  Fri: 'T6',
  Sat: 'T7',
};

/** A calendar date (`YYYY-MM-DD`, e.g. a birth or expiry date) as `20/11/2026`. */
export function formatIsoDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** `20/11/2026` */
export function formatDate(instant: Date): string {
  return formatIsoDate(vietnamDate(instant));
}

/** `14:30 20/11/2026` */
export function formatDateTime(instant: Date): string {
  return `${vietnamTime(instant)} ${formatDate(instant)}`;
}

/** `14:30 T6, 20/11/2026`: for pickup and return times, where the weekday matters. */
export function formatTripTime(instant: Date): string {
  const weekday = WEEKDAYS[weekdayIndex.format(instant)] ?? '';
  return `${vietnamTime(instant)} ${weekday}, ${formatDate(instant)}`;
}

const MINUTE_MS = 60_000;

/** A duration in Vietnamese, largest units first: `2 ngày 3 giờ 30 phút`, `45 phút`. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / MINUTE_MS));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [
    days > 0 ? `${days} ngày` : null,
    hours > 0 ? `${hours} giờ` : null,
    minutes > 0 ? `${minutes} phút` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(' ') : '0 phút';
}
