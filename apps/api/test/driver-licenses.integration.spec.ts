import { randomInt, randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';

import {
  apiErrorSchema,
  authUserSchema,
  consoleDriverLicenseSchema,
  consoleDriverLicenseSummarySchema,
  ErrorCode,
  myDriverLicensesSchema,
  pageOf,
  uploadTicketSchema,
  vietnamDate,
} from '@carenta/shared';

import { DriverLicensesService } from '../src/driver-licenses/driver-licenses.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

const errorOf = (res: request.Response) => apiErrorSchema.parse(res.body);
const mineOf = (res: request.Response) => myDriverLicensesSchema.parse(res.body);
const consoleOf = (res: request.Response) => consoleDriverLicenseSchema.parse(res.body);

/** 12 digits no other test run is likely to use. */
const randomLicenseNumber = () => `99${String(randomInt(0, 10_000_000_000)).padStart(10, '0')}`;
const inYears = (years: number) =>
  `${Number(vietnamDate().slice(0, 4)) + years}${vietnamDate().slice(4)}`;

/**
 * Driver licenses over HTTP against Postgres and RustFS (real private uploads), plus the
 * expiry jobs called directly. Run with INTEGRATION=1.
 */
describe.runIf(process.env.INTEGRATION === '1')('driver licenses', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let service: DriverLicensesService;
  const emails: string[] = [];
  let admin: Agent;

  type Agent = ReturnType<typeof request.agent>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    service = app.get(DriverLicensesService);
    const signedUp = await signUp();
    admin = signedUp.agent;
    await prisma.user.update({ where: { id: signedUp.id }, data: { role: 'ADMIN' } });
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  async function signUp({ verified = true } = {}) {
    const agent = request.agent(app.getHttpServer());
    const email = `license-${randomUUID()}@example.com`;
    emails.push(email);
    const res = await agent
      .post('/api/v1/auth/register')
      .send({ email, password: 'mat khau', fullName: 'Người Thuê' })
      .expect(201);
    const { id } = authUserSchema.parse(res.body);
    if (verified) {
      await prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
    }
    return { agent, id, email };
  }

  async function upload(agent: Agent) {
    const body = await sharp({
      create: { width: 600, height: 380, channels: 3, background: '#2266aa' },
    })
      .jpeg()
      .toBuffer();
    const res = await agent
      .post('/api/v1/uploads')
      .send({ purpose: 'DRIVER_LICENSE', contentType: 'image/jpeg', size: body.length })
      .expect(201);
    const ticket = uploadTicketSchema.parse(res.body);
    const put = await fetch(ticket.uploadUrl, {
      method: ticket.method,
      headers: ticket.headers,
      body: new Uint8Array(body),
    });
    expect(put.status).toBe(200);
    return ticket.key;
  }

  async function submit(
    agent: Agent,
    overrides: Record<string, unknown> = {},
  ): Promise<request.Response> {
    const body = {
      fullName: 'NGUYỄN VĂN A',
      licenseNumber: randomLicenseNumber(),
      licenseClass: 'B',
      dateOfBirth: '1995-04-30',
      expiresOn: inYears(5),
      frontUploadKey: await upload(agent),
      backUploadKey: await upload(agent),
      ...overrides,
    };
    const res = await agent.put('/api/v1/me/driver-license').send(body);
    if (res.status !== 200 && res.status !== 409) {
      throw new Error(`Submit failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res;
  }

  const emailsSent = (userId: string) =>
    prisma.notification
      .findMany({ where: { userId }, select: { template: true } })
      .then((rows) => rows.map((row) => row.template));

  it('needs a verified email to submit', async () => {
    const { agent } = await signUp({ verified: false });

    const res = await agent
      .put('/api/v1/me/driver-license')
      .send({
        fullName: 'A',
        licenseNumber: randomLicenseNumber(),
        licenseClass: 'B',
        dateOfBirth: '1995-04-30',
        expiresOn: inYears(5),
        frontUploadKey: 'x',
        backUploadKey: 'y',
      })
      .expect(403);

    expect(errorOf(res).code).toBe(ErrorCode.EMAIL_NOT_VERIFIED);
  });

  it('submits a license, then an admin approves it from the queue', async () => {
    const user = await signUp();
    const empty = mineOf(await user.agent.get('/api/v1/me/driver-license').expect(200));
    expect(empty).toEqual({ current: null, submission: null });

    const submitted = mineOf(await submit(user.agent));
    expect(submitted.current).toBeNull();
    expect(submitted.submission).toMatchObject({
      status: 'PENDING',
      fullName: 'NGUYỄN VĂN A',
      licenseClass: 'B',
      dateOfBirth: '1995-04-30',
    });
    // Private images, readable only through the presigned URL.
    expect((await fetch(submitted.submission!.frontImageUrl)).status).toBe(200);

    const queue = pageOf(consoleDriverLicenseSummarySchema).parse(
      (await admin.get('/api/v1/console/driver-licenses').query({ pageSize: 100 }).expect(200))
        .body,
    );
    expect(queue.items.find((item) => item.id === submitted.submission!.id)).toMatchObject({
      status: 'PENDING',
      user: { id: user.id },
      isRenewal: false,
    });

    const approved = consoleOf(
      await admin
        .post(`/api/v1/console/driver-licenses/${submitted.submission!.id}/approve`)
        .expect(200),
    );
    expect(approved).toMatchObject({ status: 'APPROVED', current: null });
    expect(approved.reviewedBy).not.toBeNull();

    const mine = mineOf(await user.agent.get('/api/v1/me/driver-license').expect(200));
    expect(mine).toMatchObject({ current: { status: 'APPROVED' }, submission: null });
    expect(await emailsSent(user.id)).toContain('driver-license.approved');

    await admin
      .post(`/api/v1/console/driver-licenses/${submitted.submission!.id}/approve`)
      .expect(409);
  });

  it('rejects with a reason, and a new submission replaces the rejected one', async () => {
    const user = await signUp();
    const first = mineOf(await submit(user.agent)).submission!;

    await admin
      .post(`/api/v1/console/driver-licenses/${first.id}/reject`)
      .send({ reason: 'Ảnh mặt sau bị mờ.' })
      .expect(200);
    const rejected = mineOf(await user.agent.get('/api/v1/me/driver-license').expect(200));
    expect(rejected.submission).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Ảnh mặt sau bị mờ.',
    });
    expect(await emailsSent(user.id)).toContain('driver-license.rejected');

    const second = mineOf(await submit(user.agent)).submission!;
    expect(second).toMatchObject({ status: 'PENDING', rejectionReason: null });
    expect(await prisma.driverLicense.count({ where: { userId: user.id } })).toBe(1);
    expect((await fetch(first.frontImageUrl)).status).toBe(404);
  });

  it('keeps the approved license usable while a renewal waits, then replaces it', async () => {
    const user = await signUp();
    const number = randomLicenseNumber();
    const original = mineOf(await submit(user.agent, { licenseNumber: number })).submission!;
    await admin.post(`/api/v1/console/driver-licenses/${original.id}/approve`).expect(200);

    // Renewed license, same number, new expiry.
    const renewal = mineOf(
      await submit(user.agent, { licenseNumber: number, expiresOn: inYears(10) }),
    );
    expect(renewal).toMatchObject({
      current: { id: original.id, status: 'APPROVED' },
      submission: { status: 'PENDING', expiresOn: inYears(10) },
    });

    const review = consoleOf(
      await admin.get(`/api/v1/console/driver-licenses/${renewal.submission!.id}`).expect(200),
    );
    expect(review.current?.id).toBe(original.id);

    await admin
      .post(`/api/v1/console/driver-licenses/${renewal.submission!.id}/approve`)
      .expect(200);
    const after = mineOf(await user.agent.get('/api/v1/me/driver-license').expect(200));
    expect(after).toMatchObject({
      current: { id: renewal.submission!.id, expiresOn: inYears(10) },
      submission: null,
    });
    expect((await fetch(renewal.current!.frontImageUrl)).status).toBe(404);
  });

  it('refuses a number another account is using', async () => {
    const number = randomLicenseNumber();
    await submit((await signUp()).agent, { licenseNumber: number });

    const res = await submit((await signUp()).agent, { licenseNumber: number });

    expect(res.status).toBe(409);
    expect(errorOf(res).code).toBe(ErrorCode.DRIVER_LICENSE_TAKEN);
  });

  it('reminds the holder before expiry and expires the license after', async () => {
    const user = await signUp();
    const id = mineOf(await submit(user.agent)).submission!.id;
    await admin.post(`/api/v1/console/driver-licenses/${id}/approve`).expect(200);
    const expiresOn = '2026-11-20';
    await prisma.driverLicense.update({
      where: { id },
      data: { expiresOn: new Date(`${expiresOn}T00:00:00Z`) },
    });

    // A job for an older expiry date does nothing.
    await service.remindExpiry({ licenseId: id, expiresOn: '2031-01-01' });
    expect(await emailsSent(user.id)).not.toContain('driver-license.expiring');
    await service.remindExpiry({ licenseId: id, expiresOn });
    expect(await emailsSent(user.id)).toContain('driver-license.expiring');

    // Still valid on its last day in Vietnam (20/11 23:30), expired just after midnight.
    await service.expire({ licenseId: id, expiresOn }, new Date('2026-11-20T16:30:00Z'));
    expect((await prisma.driverLicense.findUniqueOrThrow({ where: { id } })).status).toBe(
      'APPROVED',
    );
    await service.expire({ licenseId: id, expiresOn }, new Date('2026-11-20T17:30:00Z'));
    const mine = mineOf(await user.agent.get('/api/v1/me/driver-license').expect(200));
    expect(mine.current).toMatchObject({ status: 'EXPIRED' });
  });

  it('is reviewed by admins only', async () => {
    const res = await (await signUp()).agent.get('/api/v1/console/driver-licenses').expect(403);

    expect(errorOf(res).code).toBe(ErrorCode.FORBIDDEN);
  });
});
