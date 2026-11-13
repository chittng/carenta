import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type Job } from 'bullmq';

import { AppConfigService } from '../config/env.js';
import { NotificationStatus } from '../generated/prisma/enums.js';
import { JobsService, QueueName } from '../jobs/jobs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAIL_TRANSPORT, type MailTransport } from './mail.transport.js';
import {
  buildEmail,
  type EmailData,
  type EmailTemplateName,
  redactEmailData,
} from './templates/index.js';

export const SEND_EMAIL_JOB = 'send';

export interface SendEmailJob<N extends EmailTemplateName = EmailTemplateName> {
  notificationId: string;
  template: N;
  to: string;
  data: EmailData<N>;
}

/**
 * Sends email through the `email` queue, with retries, and logs each one in
 * `Notification` (QUEUED → SENT, or FAILED once retries run out).
 *
 * @example await mail.send('system.test', { to: user.email, userId: user.id, data: { ... } });
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;
  private readonly webUrl: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  onModuleInit() {
    this.jobs.register<SendEmailJob>(QueueName.EMAIL, SEND_EMAIL_JOB, (job) => this.deliver(job));
  }

  /**
   * Queues an email and returns its Notification id. Never throws because of the queue:
   * if Valkey is down the email is logged as FAILED, so a business action (booking,
   * payment, ...) is not rolled back over a notification.
   */
  async send<N extends EmailTemplateName>(
    template: N,
    params: { to: string; userId?: string; data: EmailData<N> },
  ): Promise<string> {
    // Rendering up front fails fast on bad data and gives the subject for the log.
    const { subject } = buildEmail(template, params.data, { webUrl: this.webUrl });
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        toEmail: params.to,
        template,
        subject,
        payload: redactEmailData(template, params.data),
      },
      select: { id: true },
    });

    const job: SendEmailJob<N> = {
      notificationId: notification.id,
      template,
      to: params.to,
      data: params.data,
    };
    try {
      await this.jobs.add(QueueName.EMAIL, SEND_EMAIL_JOB, job, { jobId: notification.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not queue email ${notification.id} (${template}): ${message}`);
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.FAILED, error: `Queue: ${message}` },
      });
    }
    return notification.id;
  }

  /** Worker side: renders and sends one queued email. Safe to run more than once. */
  async deliver(job: Pick<Job<SendEmailJob>, 'data' | 'attemptsMade' | 'opts'>): Promise<void> {
    const { notificationId, template, to, data } = job.data;
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { status: true },
    });
    // Already sent by an earlier attempt whose bookkeeping failed, or the row is gone.
    if (!notification || notification.status === NotificationStatus.SENT) return;

    try {
      const email = buildEmail(template, data, { webUrl: this.webUrl });
      await this.transport.sendMail({ from: this.from, to, ...email });
    } catch (error) {
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: lastAttempt ? NotificationStatus.FAILED : NotificationStatus.QUEUED,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.SENT, sentAt: new Date(), error: null },
    });
  }
}
