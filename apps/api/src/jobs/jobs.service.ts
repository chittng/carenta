import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, type JobsOptions, Queue, UnrecoverableError, Worker } from 'bullmq';
import { Redis, type RedisOptions } from 'ioredis';

import { AppConfigService } from '../config/env.js';

export const QueueName = {
  /** Outgoing email (MailService). */
  EMAIL: 'email',
  /** Work that must happen at a given time: payment hold expiry, deposit release, reminders. */
  SCHEDULED: 'scheduled',
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>;

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const QUEUE_SETTINGS: Record<QueueName, { concurrency: number; defaultJobOptions: JobsOptions }> = {
  email: {
    concurrency: 5,
    defaultJobOptions: {
      // 30s, 1m, 2m, 4m, 8m: rides out a short SMTP outage.
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      // Job data can hold one-time links (password reset), so it is not kept around;
      // the Notification table is the durable log.
      removeOnComplete: true,
      removeOnFail: { age: 7 * DAY },
    },
  },
  scheduled: {
    concurrency: 10,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: DAY, count: 1000 },
      removeOnFail: { age: 30 * DAY },
    },
  },
};

/** Keys in Valkey are `carenta:<queue>:...`. */
const KEY_PREFIX = 'carenta';

/** How long `add` waits for Valkey before giving up. */
const ADD_TIMEOUT_MS = 5000;

/** BullMQ uses `:` as its key separator and rejects custom ids containing it. */
const JOB_ID_PATTERN = /^[\w.-]+$/;

/**
 * Background jobs on BullMQ (Valkey).
 *
 * Feature modules register a handler per job name in `onModuleInit`, then enqueue with
 * `add` (run as soon as possible) or `schedule` (run at a given time). Handlers must be
 * idempotent and re-check the current state: a job can be retried, and a scheduled job
 * can still fire after the thing it was about has changed (e.g. the booking was paid).
 *
 * Queues connect lazily on first use, so booting the app does not need Valkey. Workers
 * start only when `JOBS_WORKER=true`. BullMQ is given ioredis clients built here, as it
 * requires under ESM; they are closed on shutdown since BullMQ does not own them.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private readonly valkeyUrl: string;
  private readonly runWorkers: boolean;
  private readonly clients: Redis[] = [];
  /** Shared by every queue (producer side). */
  private queueClient: Redis | undefined;
  private readonly handlers = new Map<QueueName, Map<string, JobHandler>>();
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.valkeyUrl = config.get('VALKEY_URL', { infer: true });
    this.runWorkers = config.get('JOBS_WORKER', { infer: true });
  }

  /** Registers the handler for jobs called `name` on `queue`. Call from `onModuleInit`. */
  register<T>(queue: QueueName, name: string, handler: JobHandler<T>): void {
    const byName = this.handlers.get(queue) ?? new Map<string, JobHandler>();
    if (byName.has(name)) throw new Error(`A handler for ${queue}/${name} is already registered`);
    // The producer and the handler agree on the data shape through the job name.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    byName.set(name, handler as JobHandler);
    this.handlers.set(queue, byName);
  }

  /**
   * Enqueues a job. With a `jobId`, adding the same id again while the job still exists
   * is a no-op, which makes enqueueing idempotent.
   *
   * Rejects after a few seconds if Valkey is unreachable, rather than holding up the
   * request; the job may still be added once the connection comes back.
   */
  async add(
    queue: QueueName,
    name: string,
    data: unknown,
    options: { jobId?: string; delayMs?: number } = {},
  ): Promise<void> {
    if (options.jobId !== undefined) assertJobId(options.jobId);
    const adding = this.queue(queue).add(name, data, {
      jobId: options.jobId,
      delay: options.delayMs,
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(new Error(`Valkey did not accept ${queue}/${name} within ${ADD_TIMEOUT_MS}ms`)),
        ADD_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([adding, timeout]);
    } finally {
      clearTimeout(timer);
      // A late failure of the abandoned add must not become an unhandled rejection.
      adding.catch(() => undefined);
    }
  }

  /**
   * Runs job `name` at `runAt` (right away if that is in the past). `jobId` identifies
   * the job for `cancel`, e.g. `booking-hold-expiry.<bookingId>`. To move a job, cancel
   * it and schedule again.
   */
  schedule(name: string, data: unknown, options: { runAt: Date; jobId: string }): Promise<void> {
    return this.add(QueueName.SCHEDULED, name, data, {
      jobId: options.jobId,
      delayMs: Math.max(0, options.runAt.getTime() - Date.now()),
    });
  }

  /**
   * Cancels a scheduled job that has not started. Returns false if there was nothing to
   * cancel or it is already running; its handler must then see the new state and do nothing.
   */
  async cancel(jobId: string): Promise<boolean> {
    assertJobId(jobId);
    const job = await this.queue(QueueName.SCHEDULED).getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (state !== 'delayed' && state !== 'waiting' && state !== 'prioritized') return false;
    await job.remove();
    return true;
  }

  onApplicationBootstrap() {
    if (!this.runWorkers) return;
    for (const [queue, byName] of this.handlers) {
      const worker = new Worker(queue, (job) => this.dispatch(byName, job), {
        // Workers block on Valkey; ioredis must retry forever instead of failing commands.
        connection: this.client(`worker:${queue}`, { maxRetriesPerRequest: null }),
        prefix: KEY_PREFIX,
        concurrency: QUEUE_SETTINGS[queue].concurrency,
      });
      worker.on('failed', (job, error) => {
        this.logger.warn(
          `${queue}/${job?.name} ${job?.id} failed (attempt ${job?.attemptsMade}): ${error.message}`,
        );
      });
      worker.on('error', (error) => this.logger.error(`${queue} worker: ${error.message}`));
      this.workers.push(worker);
    }
    this.logger.log(`Workers started: ${[...this.handlers.keys()].join(', ') || 'none'}`);
  }

  async onApplicationShutdown() {
    // Workers first so in-flight jobs finish before their queues close.
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await Promise.all(this.clients.map((client) => client.quit().catch(() => client.disconnect())));
  }

  private queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      // Fail commands soon when Valkey is down instead of queueing them for a long time.
      this.queueClient ??= this.client('queues', { lazyConnect: true, maxRetriesPerRequest: 1 });
      queue = new Queue(name, {
        connection: this.queueClient,
        prefix: KEY_PREFIX,
        defaultJobOptions: QUEUE_SETTINGS[name].defaultJobOptions,
      });
      queue.on('error', (error) => this.logger.error(`${name} queue: ${error.message}`));
      this.queues.set(name, queue);
    }
    return queue;
  }

  private client(label: string, options: RedisOptions): Redis {
    const client = new Redis(this.valkeyUrl, options);
    // Without a listener ioredis prints every reconnect failure as an unhandled error.
    client.on('error', (error: Error) => this.logger.error(`Valkey (${label}): ${error.message}`));
    this.clients.push(client);
    return client;
  }

  private async dispatch(byName: Map<string, JobHandler>, job: Job): Promise<void> {
    const handler = byName.get(job.name);
    // Retrying cannot help; fail the job for good.
    if (!handler) throw new UnrecoverableError(`No handler registered for job "${job.name}"`);
    await handler(job);
  }
}

function assertJobId(jobId: string) {
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new Error(`Invalid job id "${jobId}": use letters, digits, ".", "_" or "-"`);
  }
}
