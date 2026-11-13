export { slugify } from '../../src/common/slug.js';

/**
 * Every calendar day from `from` to `to` inclusive, as UTC-midnight Dates.
 * Prisma maps a UTC-midnight Date to the same DATE value in PostgreSQL.
 */
export function expandDateRange(from: string, to: string): Date[] {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (end < start) {
    throw new Error(`Invalid date range: ${from} > ${to}`);
  }
  const days: Date[] = [];
  for (let day = start; day <= end; day = new Date(day.getTime() + 86_400_000)) {
    days.push(day);
  }
  return days;
}

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Expected YYYY-MM-DD, got "${value}"`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid date "${value}"`);
  }
  return date;
}
