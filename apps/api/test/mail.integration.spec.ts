import { randomUUID } from 'node:crypto';

import { type INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { z } from 'zod';

import { NotificationStatus } from '../src/generated/prisma/enums.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { eventually } from './eventually.js';

const MAILPIT_API = 'http://localhost:8025/api/v1';

const mailpitSearchSchema = z.object({
  messages: z.array(
    z.object({
      ID: z.string(),
      Subject: z.string(),
      From: z.object({ Address: z.string() }),
      To: z.array(z.object({ Address: z.string() })),
    }),
  ),
});

/**
 * Email through the real stack: Postgres (Notification), Valkey (queue + worker), SMTP
 * into Mailpit. Needs `docker compose up -d` and `pnpm db:migrate`. Run with INTEGRATION=1.
 */
describe.runIf(process.env.INTEGRATION === '1')('email end to end', () => {
  let app: INestApplicationContext;

  beforeAll(async () => {
    // ConfigModule reads the environment when AppModule is first imported, so the
    // worker switch has to be set before that import.
    process.env.JOBS_WORKER = 'true';
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await moduleRef.init();
  });

  afterAll(async () => {
    await app?.close();
    process.env.JOBS_WORKER = 'false';
  });

  it(
    'delivers a queued email to the SMTP server and logs it as SENT',
    { timeout: 20_000 },
    async () => {
      const to = `test-${randomUUID()}@example.com`;

      const id = await app
        .get(MailService)
        .send('system.test', { to, data: { requestedAt: new Date().toISOString() } });

      const prisma = app.get(PrismaService);
      const { status } = await eventually(
        () => prisma.notification.findUniqueOrThrow({ where: { id } }),
        (row) => row.status !== NotificationStatus.QUEUED,
        15_000,
      );
      expect(status).toBe(NotificationStatus.SENT);

      const response = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
      const { messages } = mailpitSearchSchema.parse(await response.json());
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        Subject: 'Email thử từ Carenta',
        From: { Address: 'no-reply@carenta.local' },
        To: [{ Address: to }],
      });

      await prisma.notification.delete({ where: { id } });
      await fetch(`${MAILPIT_API}/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: [messages[0]!.ID] }),
      });
    },
  );
});
