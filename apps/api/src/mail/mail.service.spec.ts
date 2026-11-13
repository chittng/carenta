import { testConfig } from '../../test/test-config.js';
import { NotificationStatus } from '../generated/prisma/enums.js';
import { type JobHandler, type JobsService, QueueName } from '../jobs/jobs.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { MailService, SEND_EMAIL_JOB, type SendEmailJob } from './mail.service.js';
import { type MailTransport, type OutgoingMail } from './mail.transport.js';

interface Row {
  id: string;
  userId?: string;
  toEmail: string;
  template: string;
  subject: string;
  payload: unknown;
  status: NotificationStatus;
  error?: string | null;
  sentAt?: Date;
}

/** Just the `notification` calls MailService makes. */
class FakePrisma {
  readonly rows = new Map<string, Row>();
  private nextId = 1;

  readonly notification = {
    create: ({ data }: { data: Omit<Row, 'id' | 'status'> }) => {
      const row: Row = { ...data, id: `n${this.nextId++}`, status: NotificationStatus.QUEUED };
      this.rows.set(row.id, row);
      return Promise.resolve({ id: row.id });
    },
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(this.rows.get(where.id) ?? null),
    update: ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = this.rows.get(where.id);
      if (!row) return Promise.reject(new Error('not found'));
      Object.assign(row, data);
      return Promise.resolve(row);
    },
  };
}

class FakeJobs {
  readonly added: { queue: string; name: string; data: SendEmailJob; jobId?: string }[] = [];
  readonly handlers = new Map<string, JobHandler>();
  failWith: Error | undefined;

  register(queue: string, name: string, handler: JobHandler) {
    this.handlers.set(`${queue}/${name}`, handler);
  }

  add(queue: string, name: string, data: SendEmailJob, options: { jobId?: string } = {}) {
    if (this.failWith) return Promise.reject(this.failWith);
    this.added.push({ queue, name, data, jobId: options.jobId });
    return Promise.resolve();
  }
}

class FakeTransport implements MailTransport {
  readonly sent: OutgoingMail[] = [];
  failures: Error[] = [];

  sendMail(mail: OutgoingMail) {
    const failure = this.failures.shift();
    if (failure) return Promise.reject(failure);
    this.sent.push(mail);
    return Promise.resolve({});
  }

  close() {}
}

function setup() {
  const prisma = new FakePrisma();
  const jobs = new FakeJobs();
  const transport = new FakeTransport();
  const mail = new MailService(
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- structural test double
    prisma as unknown as PrismaService,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- structural test double
    jobs as unknown as JobsService,
    transport,
    testConfig({ WEB_URL: 'https://carenta.vn' }).config,
  );
  mail.onModuleInit();
  return { prisma, jobs, transport, mail };
}

const DATA = { requestedAt: '2026-11-13T07:30:00Z' };

/** A job as the worker would see it on attempt `attempt` of 5. */
function jobFor(data: SendEmailJob, attempt = 1) {
  return { data, attemptsMade: attempt - 1, opts: { attempts: 5 } };
}

/** A sent `system.test` email, as the worker would pick it up. */
async function queued() {
  const context = setup();
  await context.mail.send('system.test', { to: 'an@example.com', data: DATA });
  const job = context.jobs.added[0]!.data;
  return { ...context, job, row: () => context.prisma.rows.get(job.notificationId)! };
}

describe('MailService', () => {
  it('registers the email worker handler', () => {
    const { jobs } = setup();

    expect(jobs.handlers.has(`${QueueName.EMAIL}/${SEND_EMAIL_JOB}`)).toBe(true);
  });

  describe('send', () => {
    it('logs the email as QUEUED and enqueues it under the notification id', async () => {
      const { prisma, jobs, mail } = setup();

      const id = await mail.send('system.test', { to: 'an@example.com', userId: 'u1', data: DATA });

      expect(prisma.rows.get(id)).toMatchObject({
        userId: 'u1',
        toEmail: 'an@example.com',
        template: 'system.test',
        subject: 'Email thử từ Carenta',
        payload: DATA,
        status: NotificationStatus.QUEUED,
      });
      expect(jobs.added).toEqual([
        {
          queue: QueueName.EMAIL,
          name: SEND_EMAIL_JOB,
          jobId: id,
          data: { notificationId: id, template: 'system.test', to: 'an@example.com', data: DATA },
        },
      ]);
    });

    it('marks the email FAILED instead of throwing when the queue is unavailable', async () => {
      const { prisma, jobs, mail } = setup();
      jobs.failWith = new Error('Connection is closed.');

      const id = await mail.send('system.test', { to: 'an@example.com', data: DATA });

      expect(prisma.rows.get(id)).toMatchObject({
        status: NotificationStatus.FAILED,
        error: 'Queue: Connection is closed.',
      });
    });
  });

  describe('deliver', () => {
    it('sends the rendered email from MAIL_FROM and marks it SENT', async () => {
      const { mail, transport, job, row } = await queued();

      await mail.deliver(jobFor(job));

      expect(transport.sent).toHaveLength(1);
      expect(transport.sent[0]).toMatchObject({
        from: 'Carenta <no-reply@carenta.local>',
        to: 'an@example.com',
        subject: 'Email thử từ Carenta',
      });
      expect(transport.sent[0]!.html).toContain('14:30 13/11/2026');
      expect(transport.sent[0]!.text).toContain('Email thử nghiệm');
      expect(row()).toMatchObject({ status: NotificationStatus.SENT, error: null });
      expect(row().sentAt).toBeInstanceOf(Date);
    });

    it('does not send twice when a job runs again after success', async () => {
      const { mail, transport, job } = await queued();

      await mail.deliver(jobFor(job));
      await mail.deliver(jobFor(job, 2));

      expect(transport.sent).toHaveLength(1);
    });

    it('keeps the email QUEUED with the error while retries remain', async () => {
      const { mail, transport, job, row } = await queued();
      transport.failures = [new Error('ECONNREFUSED')];

      await expect(mail.deliver(jobFor(job, 1))).rejects.toThrow('ECONNREFUSED');

      expect(row()).toMatchObject({ status: NotificationStatus.QUEUED, error: 'ECONNREFUSED' });
    });

    it('marks the email FAILED on the last attempt', async () => {
      const { mail, transport, job, row } = await queued();
      transport.failures = [new Error('550 mailbox unavailable')];

      await expect(mail.deliver(jobFor(job, 5))).rejects.toThrow('550');

      expect(row()).toMatchObject({
        status: NotificationStatus.FAILED,
        error: '550 mailbox unavailable',
      });
    });

    it('succeeds on a retry after a failure', async () => {
      const { mail, transport, job, row } = await queued();
      transport.failures = [new Error('timeout')];

      await expect(mail.deliver(jobFor(job, 1))).rejects.toThrow('timeout');
      await mail.deliver(jobFor(job, 2));

      expect(row()).toMatchObject({ status: NotificationStatus.SENT, error: null });
    });

    it('skips a job whose notification no longer exists', async () => {
      const { mail, transport, prisma, job } = await queued();
      prisma.rows.clear();

      await mail.deliver(jobFor(job));

      expect(transport.sent).toHaveLength(0);
    });
  });
});
