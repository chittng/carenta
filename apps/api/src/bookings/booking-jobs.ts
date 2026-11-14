import { type Prisma } from '../generated/prisma/client.js';

export const BOOKING_JOBS = {
  approval: 'booking-approval-expiry',
  payment: 'booking-payment-expiry',
  hold: 'booking-hold-expiry',
} as const;
export type BookingJobName = (typeof BOOKING_JOBS)[keyof typeof BOOKING_JOBS];
export const bookingJobId = (name: BookingJobName, bookingId: string) => `${name}.${bookingId}`;

/** Persist queue intent in the SAME database transaction as the booking change. */
export async function writeBookingJob(
  tx: Prisma.TransactionClient,
  bookingId: string,
  jobName: BookingJobName,
  runAt: Date | null,
): Promise<void> {
  const data = {
    bookingId,
    jobName,
    action: runAt ? ('SCHEDULE' as const) : ('CANCEL' as const),
    runAt,
  };
  await tx.bookingJobOutbox.upsert({
    where: { jobId: bookingJobId(jobName, bookingId) },
    create: { jobId: bookingJobId(jobName, bookingId), ...data },
    update: data,
  });
}

export async function cancelBookingJobs(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<void> {
  // A fixed order matches the publisher's order and avoids multi-row deadlocks.
  for (const name of Object.values(BOOKING_JOBS).toSorted()) {
    // oxlint-disable-next-line no-await-in-loop -- deterministic row-lock order
    await writeBookingJob(tx, bookingId, name, null);
  }
}
