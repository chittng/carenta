/**
 * Sends the `system.test` email through the real queue and SMTP, then waits for the result.
 *   pnpm --filter @carenta/api mail:test someone@example.com
 * Locally it lands in Mailpit (http://localhost:8025). Needs Postgres and Valkey up.
 */
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';

import { AppModule } from '../app.module.js';
import { type Notification } from '../generated/prisma/client.js';
import { NotificationStatus } from '../generated/prisma/enums.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const TIMEOUT_MS = 30_000;

async function main() {
  const to = z.email().safeParse(process.argv[2]);
  if (!to.success) {
    console.error('Usage: pnpm --filter @carenta/api mail:test <email>');
    process.exitCode = 1;
    return;
  }

  // This process sends the email itself, whatever JOBS_WORKER says.
  process.env.JOBS_WORKER = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const id = await app
      .get(MailService)
      .send('system.test', { to: to.data, data: { requestedAt: new Date().toISOString() } });
    const prisma = app.get(PrismaService);

    const deadline = Date.now() + TIMEOUT_MS;
    const waitForResult = async (): Promise<Notification> => {
      const row = await prisma.notification.findUniqueOrThrow({ where: { id } });
      if (row.status !== NotificationStatus.QUEUED || Date.now() > deadline) return row;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return waitForResult();
    };
    const notification = await waitForResult();

    if (notification.status === NotificationStatus.SENT) {
      console.warn(`Sent to ${to.data} (notification ${id}).`);
    } else {
      console.error(
        `Not sent (${notification.status}): ${notification.error ?? 'still queued, retrying in background'}`,
      );
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

await main();
