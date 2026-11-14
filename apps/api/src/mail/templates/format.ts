import { APP_TIME_ZONE } from '@carenta/shared';

const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `14:30 13/11/2026`, in Vietnam time regardless of the server's time zone. */
export function formatDateTime(date: Date): string {
  const parts = Object.fromEntries(
    dateTimeFormat.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}

/** `30/04/2027` for a `@db.Date` value (midnight UTC): a calendar day, not an instant. */
export function formatDate(date: Date): string {
  const [year, month, day] = date.toISOString().slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
