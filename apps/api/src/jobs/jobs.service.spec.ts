import { testConfig } from '../../test/test-config.js';
import { JobsService, QueueName } from './jobs.service.js';

// Behaviour against a real Valkey is in test/jobs.integration.spec.ts.
const noop = () => Promise.resolve();

describe('JobsService', () => {
  it('rejects a second handler for the same job', () => {
    const jobs = new JobsService(testConfig().config);
    jobs.register(QueueName.SCHEDULED, 'booking-hold-expiry', noop);

    expect(() => jobs.register(QueueName.SCHEDULED, 'booking-hold-expiry', noop)).toThrow(
      'already registered',
    );
    expect(() => jobs.register(QueueName.EMAIL, 'booking-hold-expiry', noop)).not.toThrow();
  });

  it.each(['booking:1', 'a b', ''])(
    'rejects job id %j, which BullMQ cannot store',
    async (jobId) => {
      const jobs = new JobsService(testConfig().config);

      await expect(jobs.schedule('x', {}, { runAt: new Date(), jobId })).rejects.toThrow(
        'Invalid job id',
      );
      await expect(jobs.cancel(jobId)).rejects.toThrow('Invalid job id');
    },
  );

  it('boots and shuts down without touching Valkey when workers are off', async () => {
    const jobs = new JobsService(testConfig({ VALKEY_URL: 'redis://localhost:1' }).config);
    jobs.register(QueueName.EMAIL, 'send', noop);

    jobs.onApplicationBootstrap();
    await expect(jobs.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
