import { randomUUID } from 'node:crypto';

import { JobsService, QueueName } from '../src/jobs/jobs.service.js';
import { eventually } from './eventually.js';
import { testConfig } from './test-config.js';

/** BullMQ against the Valkey from compose.yaml. Run with INTEGRATION=1 (see AGENTS.md). */
describe.runIf(process.env.INTEGRATION === '1')('JobsService against Valkey', () => {
  const jobs = new JobsService(testConfig({ JOBS_WORKER: 'true' }).config);
  // Tests use Valkey database 1 (vitest.config.ts), so a running dev server's workers never
  // see these jobs; the unique name keeps reruns apart.
  const name = `test-${randomUUID()}`;
  const runs: { id: string | undefined; data: unknown; at: number }[] = [];

  beforeAll(() => {
    jobs.register(QueueName.SCHEDULED, name, (job) => {
      runs.push({ id: job.id, data: job.data, at: Date.now() });
      return Promise.resolve();
    });
    jobs.onApplicationBootstrap();
  });

  afterAll(() => jobs.onApplicationShutdown());

  it('runs a scheduled job at its time, not before', async () => {
    const jobId = `run.${randomUUID()}`;
    const runAt = new Date(Date.now() + 1000);

    await jobs.schedule(name, { bookingId: 'b1' }, { runAt, jobId });

    const run = await eventually(
      () => runs.find((r) => r.id === jobId),
      (found) => found !== undefined,
    );
    expect(run?.data).toEqual({ bookingId: 'b1' });
    expect(run?.at).toBeGreaterThanOrEqual(runAt.getTime() - 50);
  });

  it('cancels a job that has not run yet', async () => {
    const jobId = `cancel.${randomUUID()}`;
    await jobs.schedule(name, {}, { runAt: new Date(Date.now() + 1500), jobId });

    await expect(jobs.cancel(jobId)).resolves.toBe(true);
    await expect(jobs.cancel(jobId)).resolves.toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(runs.some((run) => run.id === jobId)).toBe(false);
  });

  it('adds a job id only once', async () => {
    const jobId = `once.${randomUUID()}`;
    const runAt = new Date(Date.now() + 500);

    await jobs.schedule(name, { n: 1 }, { runAt, jobId });
    await jobs.schedule(name, { n: 2 }, { runAt, jobId });

    await eventually(
      () => runs.filter((run) => run.id === jobId),
      (found) => found.length > 0,
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(runs.filter((run) => run.id === jobId)).toEqual([
      expect.objectContaining({ data: { n: 1 } }),
    ]);
  });

  it('fails fast when Valkey is unreachable', async () => {
    const offline = new JobsService(testConfig({ VALKEY_URL: 'redis://localhost:1' }).config);
    const started = Date.now();

    await expect(offline.schedule(name, {}, { runAt: new Date(), jobId: 'x' })).rejects.toThrow(
      /Connection is closed|did not accept/,
    );
    expect(Date.now() - started).toBeLessThan(6000);
    await offline.onApplicationShutdown();
  });
});
