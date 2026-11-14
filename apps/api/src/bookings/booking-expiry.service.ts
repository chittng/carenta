import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';

import { type Prisma } from '../generated/prisma/client.js';
import { JobsService, QueueName } from '../jobs/jobs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BookingJobOutboxService } from './booking-job-outbox.service.js';
import { BOOKING_JOBS } from './booking-jobs.js';
import { BookingStateMachine } from './booking-state-machine.js';

@Injectable()
export class BookingExpiryService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(BookingStateMachine) private readonly state: BookingStateMachine,
    @Inject(BookingJobOutboxService) private readonly outbox: BookingJobOutboxService,
  ) {}

  onModuleInit(): void {
    for (const name of Object.values(BOOKING_JOBS)) {
      this.jobs.register<{ bookingId: string }>(QueueName.SCHEDULED, name, (job) =>
        this.expire(job.data.bookingId),
      );
    }
  }

  async expire(bookingId: string, now?: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { id: true },
      });
      if (exists) await this.state.expire(tx, bookingId, now);
    });
    await this.outbox.flushBooking(bookingId);
  }

  /** Used under the car lock before checking availability or taking a pending request. */
  async expireForCar(tx: Prisma.TransactionClient, carId: string, now: Date): Promise<void> {
    const due = await tx.booking.findMany({
      where: {
        carId,
        OR: [
          { status: 'PENDING_APPROVAL', approvalDeadlineAt: { lte: now } },
          { status: 'AWAITING_PAYMENT', paymentDeadlineAt: { lte: now } },
        ],
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    for (const booking of due) {
      // oxlint-disable-next-line no-await-in-loop -- all writers use car -> booking lock order
      await this.state.expire(tx, booking.id, now);
    }
  }
}
