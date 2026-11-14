import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { AppConfigService } from '../config/env.js';
import { JobsService } from '../jobs/jobs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Queue delivery recovery only; business timers still run through JobsService/BullMQ. */
@Injectable()
export class BookingJobOutboxService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BookingJobOutboxService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private publishing: Promise<void> | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('JOBS_WORKER', { infer: true })) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), 5000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.publishing;
  }

  /** Called after commit to publish promptly; failures leave durable commands for retry. */
  async flushBooking(bookingId: string): Promise<void> {
    try {
      const rows = await this.prisma.bookingJobOutbox.findMany({
        where: { bookingId },
        select: { jobId: true },
        orderBy: { jobId: 'asc' },
      });
      await Promise.all(rows.map((row) => this.publish(row.jobId)));
    } catch (error) {
      this.logger.warn(`Booking ${bookingId} queue commands remain pending: ${String(error)}`);
    }
  }

  async flushPending(): Promise<void> {
    const rows = await this.prisma.bookingJobOutbox.findMany({
      take: 20,
      orderBy: [{ updatedAt: 'asc' }, { jobId: 'asc' }],
      select: { jobId: true },
    });
    const results = await Promise.allSettled(rows.map((row) => this.publish(row.jobId)));
    for (const result of results) {
      if (result.status === 'rejected')
        this.logger.warn(`Could not publish booking queue command: ${String(result.reason)}`);
    }
  }

  private poll(): void {
    if (this.publishing) return;
    this.publishing = this.flushPending()
      .catch((error: unknown) => {
        this.logger.error(`Could not read booking job outbox: ${String(error)}`);
      })
      .finally(() => {
        this.publishing = undefined;
      });
  }

  private async publish(jobId: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        // Multiple API/worker instances can drain safely. Writers of the same command wait
        // until this lock is released, so a later cancellation cannot be lost.
        const locked = await tx.$queryRaw<{ job_id: string }[]>`
        SELECT job_id FROM booking_job_outbox WHERE job_id = ${jobId} FOR UPDATE SKIP LOCKED`;
        if (locked.length === 0) return;
        const row = await tx.bookingJobOutbox.findUniqueOrThrow({ where: { jobId } });
        if (row.action === 'CANCEL') await this.jobs.cancel(row.jobId);
        else {
          if (!row.runAt) throw new Error('A schedule command must have a run time');
          await this.jobs.schedule(
            row.jobName,
            { bookingId: row.bookingId },
            { runAt: row.runAt, jobId: row.jobId },
          );
        }
        await tx.bookingJobOutbox.delete({ where: { jobId } });
      },
      { timeout: 15_000 },
    );
  }
}
