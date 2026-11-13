import { randomUUID } from 'node:crypto';

import { Controller, Get } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { type MockInstance } from 'vitest';
import { z } from 'zod';

import { apiErrorSchema, authUserSchema, ErrorCode, uploadTicketSchema } from '@carenta/shared';

import { REFRESH_COOKIE } from '../src/auth/auth.constants.js';
import { RequireVerifiedEmail, Roles } from '../src/auth/decorators.js';
import { MailService } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

@Controller('test-guards')
class TestGuardsController {
  @Get('signed-in')
  signedIn() {
    return { ok: true };
  }

  @Get('verified')
  @RequireVerifiedEmail()
  verified() {
    return { ok: true };
  }

  @Get('admin')
  @Roles('ADMIN')
  admin() {
    return { ok: true };
  }
}

const cookieHeader = (res: request.Response) =>
  z.array(z.string()).catch([]).parse(res.headers['set-cookie']);

const errorOf = (res: request.Response) => apiErrorSchema.parse(res.body);

/**
 * Auth over HTTP against Postgres and Valkey (rate limits). Needs `docker compose up -d`
 * and `pnpm db:migrate`; run with INTEGRATION=1.
 */
describe.runIf(process.env.INTEGRATION === '1')('auth', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let sendMail: MockInstance<MailService['send']>;
  const emails: string[] = [];

  const PASSWORD = 'mat khau bat ky';

  beforeAll(async () => {
    app = await createTestApp({ controllers: [TestGuardsController] });
    prisma = app.get(PrismaService);
    sendMail = vi.spyOn(app.get(MailService), 'send');
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: emails } } });
    await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  const newEmail = () => {
    const email = `auth-${randomUUID()}@example.com`;
    emails.push(email);
    return email;
  };

  /** A browser: keeps cookies between requests. */
  const browser = () => request.agent(app.getHttpServer());

  async function register(agent = browser(), email = newEmail()) {
    const res = await agent
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName: 'Nguyễn Văn An' })
      .expect(201);
    return { agent, email, user: authUserSchema.parse(res.body) };
  }

  /** The token in the last link emailed to `email` by `template`. */
  function lastLinkToken(email: string, template: 'auth.verify-email' | 'auth.reset-password') {
    const call = sendMail.mock.calls.findLast(
      ([name, params]) => name === template && params.to === email,
    );
    if (!call) throw new Error(`No ${template} email to ${email}`);
    const { data } = call[1];
    const url = 'verifyUrl' in data ? data.verifyUrl : 'resetUrl' in data ? data.resetUrl : '';
    return new URL(url).searchParams.get('token') ?? '';
  }

  describe('register', () => {
    it('creates an unverified account, signs it in and emails a verification link', async () => {
      const agent = browser();
      const email = newEmail();

      const res = await agent
        .post('/api/v1/auth/register')
        .send({
          email: `  ${email.toUpperCase()} `,
          password: PASSWORD,
          fullName: ' Nguyễn Văn An ',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        email,
        fullName: 'Nguyễn Văn An',
        role: 'USER',
        emailVerified: false,
      });
      const cookies = cookieHeader(res);
      expect(cookies.find((c) => c.startsWith('carenta_access='))).toMatch(
        /HttpOnly.*SameSite=Lax|SameSite=Lax.*HttpOnly/,
      );
      expect(cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`))).toContain(
        'Path=/api/v1/auth',
      );
      await agent.get('/api/v1/auth/me').expect(200);

      expect(lastLinkToken(email, 'auth.verify-email')).not.toBe('');
      const notification = await prisma.notification.findFirstOrThrow({
        where: { toEmail: email, template: 'auth.verify-email' },
      });
      expect(notification.payload).toEqual({ fullName: 'Nguyễn Văn An', verifyUrl: '[ẩn]' });
    });

    it('rejects an email that is already registered, whatever its case', async () => {
      const { email } = await register();

      const res = await browser()
        .post('/api/v1/auth/register')
        .send({ email: email.toUpperCase(), password: 'x', fullName: 'B' })
        .expect(409);

      expect(errorOf(res).code).toBe(ErrorCode.EMAIL_TAKEN);
    });

    it.each([
      [{ email: 'not-an-email', password: 'x', fullName: 'A' }, 'email'],
      [{ email: 'a@example.com', password: '', fullName: 'A' }, 'password'],
      [{ email: 'a@example.com', password: 'x'.repeat(129), fullName: 'A' }, 'password'],
      [{ email: 'a@example.com', password: 'x', fullName: '   ' }, 'fullName'],
    ])('validates %j', async (body, field) => {
      const res = await browser().post('/api/v1/auth/register').send(body).expect(400);

      expect(errorOf(res).details?.map((d) => d.path)).toEqual([field]);
    });

    it('accepts any non-empty password (no strength rules)', async () => {
      const res = await browser()
        .post('/api/v1/auth/register')
        .send({ email: newEmail(), password: '1', fullName: 'A' })
        .expect(201);

      expect(authUserSchema.parse(res.body).emailVerified).toBe(false);
    });
  });

  describe('email verification', () => {
    it('verifies with the emailed link, once', async () => {
      const { agent, email } = await register();
      const token = lastLinkToken(email, 'auth.verify-email');

      await browser().post('/api/v1/auth/verify-email').send({ token }).expect(204);

      const me = await agent.get('/api/v1/auth/me').expect(200);
      expect(authUserSchema.parse(me.body).emailVerified).toBe(true);
      const again = await browser().post('/api/v1/auth/verify-email').send({ token }).expect(400);
      expect(errorOf(again).code).toBe(ErrorCode.INVALID_LINK);
      const resend = await agent.post('/api/v1/auth/resend-verification').expect(409);
      expect(errorOf(resend).code).toBe(ErrorCode.EMAIL_ALREADY_VERIFIED);
    });

    it('resends a new link that replaces the old one, with a 60 second cooldown', async () => {
      const { agent, email } = await register();
      const first = lastLinkToken(email, 'auth.verify-email');

      await agent.post('/api/v1/auth/resend-verification').expect(204);
      const second = lastLinkToken(email, 'auth.verify-email');
      const tooSoon = await agent.post('/api/v1/auth/resend-verification').expect(429);

      expect(second).not.toBe(first);
      expect(errorOf(tooSoon).message).toMatch(/đợi \d+ giây/);
      await browser().post('/api/v1/auth/verify-email').send({ token: first }).expect(400);
      await browser().post('/api/v1/auth/verify-email').send({ token: second }).expect(204);
    });

    it('rejects an expired link', async () => {
      const { email, user } = await register();
      const token = lastLinkToken(email, 'auth.verify-email');
      await prisma.authToken.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await browser().post('/api/v1/auth/verify-email').send({ token }).expect(400);

      expect(errorOf(res).code).toBe(ErrorCode.INVALID_LINK);
    });
  });

  describe('login and sessions', () => {
    it('signs in with the right password only, without revealing which part was wrong', async () => {
      const { email } = await register();

      const wrong = await browser()
        .post('/api/v1/auth/login')
        .send({ email, password: 'sai' })
        .expect(401);
      const unknown = await browser()
        .post('/api/v1/auth/login')
        .send({ email: newEmail(), password: PASSWORD })
        .expect(401);
      const agent = browser();
      await agent
        .post('/api/v1/auth/login')
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(200);

      expect(wrong.body).toEqual(unknown.body);
      expect(errorOf(wrong).code).toBe(ErrorCode.INVALID_CREDENTIALS);
      await agent.get('/api/v1/auth/me').expect(200);
    });

    it('blocks the email and IP for 15 minutes after 5 failed attempts', async () => {
      const { email } = await register();
      for (let attempt = 1; attempt <= 5; attempt++) {
        // oxlint-disable-next-line no-await-in-loop -- attempts must happen in order
        await browser().post('/api/v1/auth/login').send({ email, password: 'sai' }).expect(401);
      }

      const blocked = await browser()
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(429);

      expect(errorOf(blocked).message).toMatch(/thử lại sau 15 phút/);
    });

    it('signs out this device', async () => {
      const { agent } = await register();

      const logout = await agent.post('/api/v1/auth/logout').expect(204);

      expect(cookieHeader(logout).every((c) => c.includes('Expires=Thu, 01 Jan 1970'))).toBe(true);
      await agent.get('/api/v1/auth/me').expect(401);
      const refresh = await agent.post('/api/v1/auth/refresh').expect(401);
      expect(errorOf(refresh).message).toBe('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    });

    it('rotates the refresh token on every refresh', async () => {
      const { agent, user } = await register();
      // Scoped to this user: other test files create sessions in parallel.
      const live = { userId: user.id, revokedAt: null };
      expect(await prisma.userSession.count({ where: live })).toBe(1);

      const res = await agent.post('/api/v1/auth/refresh').expect(204);

      expect(cookieHeader(res).some((c) => c.startsWith(`${REFRESH_COOKIE}=`))).toBe(true);
      expect(await prisma.userSession.count({ where: live })).toBe(1);
      await agent.get('/api/v1/auth/me').expect(200);
    });

    it('ends the whole session when an old refresh token is replayed', async () => {
      const { agent, user } = await register();
      const login = await agent.post('/api/v1/auth/refresh').expect(204);
      const stolen = cookieHeader(login)
        .find((c) => c.startsWith(`${REFRESH_COOKIE}=`))!
        .split(';')[0]!;
      await agent.post('/api/v1/auth/refresh').expect(204);
      // Past the grace window for concurrent tabs.
      await prisma.userSession.updateMany({
        where: { userId: user.id, replacedById: { not: null } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', stolen)
        .expect(401);

      await agent.get('/api/v1/auth/me').expect(401);
      await agent.post('/api/v1/auth/refresh').expect(401);
      expect(await prisma.userSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(
        0,
      );
    });

    it('treats a replay within seconds as two tabs racing, not theft', async () => {
      const { agent, user } = await register();
      const first = await agent.post('/api/v1/auth/refresh').expect(204);
      const raced = cookieHeader(first)
        .find((c) => c.startsWith(`${REFRESH_COOKIE}=`))!
        .split(';')[0]!;
      await agent.post('/api/v1/auth/refresh').expect(204);

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', raced)
        .expect(401);

      await agent.get('/api/v1/auth/me').expect(200);
      expect(await prisma.userSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(
        1,
      );
    });

    it('cuts off a locked account immediately', async () => {
      const { agent, email, user } = await register();

      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'LOCKED', lockedAt: new Date() },
      });

      await agent.get('/api/v1/auth/me').expect(401);
      await agent.post('/api/v1/auth/refresh').expect(401);
      const login = await browser()
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(403);
      expect(errorOf(login).code).toBe(ErrorCode.ACCOUNT_LOCKED);
      const wrong = await browser()
        .post('/api/v1/auth/login')
        .send({ email, password: 'sai' })
        .expect(401);
      expect(errorOf(wrong).code).toBe(ErrorCode.INVALID_CREDENTIALS);
    });
  });

  describe('passwords', () => {
    it('resets the password from the emailed link and signs out everywhere', async () => {
      const { agent, email } = await register();

      await browser().post('/api/v1/auth/forgot-password').send({ email }).expect(204);
      const token = lastLinkToken(email, 'auth.reset-password');
      await browser()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'mới' })
        .expect(204);

      await agent.get('/api/v1/auth/me').expect(401);
      await browser().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(401);
      const login = await browser()
        .post('/api/v1/auth/login')
        .send({ email, password: 'mới' })
        .expect(200);
      expect(authUserSchema.parse(login.body).emailVerified).toBe(true);
      const reused = await browser()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'khác' })
        .expect(400);
      expect(errorOf(reused).code).toBe(ErrorCode.INVALID_LINK);
    });

    it('answers forgot-password the same for unknown emails and sends nothing', async () => {
      const email = newEmail();
      sendMail.mockClear();

      await browser().post('/api/v1/auth/forgot-password').send({ email }).expect(204);

      expect(sendMail).not.toHaveBeenCalled();
      const again = await browser()
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(429);
      expect(errorOf(again).code).toBe(ErrorCode.TOO_MANY_REQUESTS);
    });

    it('changes the password, keeping this device and signing out the others', async () => {
      const { agent, email } = await register();
      const otherDevice = browser();
      await otherDevice.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);

      const wrong = await agent
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'sai', newPassword: 'mới' })
        .expect(400);
      await agent
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'mới' })
        .expect(204);

      expect(errorOf(wrong).code).toBe(ErrorCode.WRONG_PASSWORD);
      await agent.get('/api/v1/auth/me').expect(200);
      await otherDevice.get('/api/v1/auth/me').expect(401);
      await browser().post('/api/v1/auth/login').send({ email, password: 'mới' }).expect(200);
    });
  });

  describe('guards', () => {
    it('requires a session by default', async () => {
      const res = await browser().get('/api/v1/test-guards/signed-in').expect(401);

      expect(res.body).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Vui lòng đăng nhập để tiếp tục.',
      });
    });

    it('ignores a forged access token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/test-guards/signed-in')
        .set('Cookie', 'carenta_access=eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4Iiwic2lkIjoieSJ9.')
        .expect(401);

      expect(errorOf(res).code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('blocks unverified users from actions that need a verified email', async () => {
      const { agent, email } = await register();

      await agent.get('/api/v1/test-guards/signed-in').expect(200);
      const blocked = await agent.get('/api/v1/test-guards/verified').expect(403);
      expect(errorOf(blocked).code).toBe(ErrorCode.EMAIL_NOT_VERIFIED);

      await browser()
        .post('/api/v1/auth/verify-email')
        .send({ token: lastLinkToken(email, 'auth.verify-email') })
        .expect(204);
      await agent.get('/api/v1/test-guards/verified').expect(200);
    });

    it('restricts admin routes to admins', async () => {
      const { agent, user } = await register();

      const denied = await agent.get('/api/v1/test-guards/admin').expect(403);
      expect(errorOf(denied).code).toBe(ErrorCode.FORBIDDEN);
      await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
      await agent.get('/api/v1/test-guards/admin').expect(200);
    });
  });

  describe('uploads', () => {
    it('gives signed-in users an upload ticket under their own prefix', async () => {
      await browser()
        .post('/api/v1/uploads')
        .send({ purpose: 'AVATAR', contentType: 'image/png', size: 1000 })
        .expect(401);
      const { agent, user } = await register();

      const res = await agent
        .post('/api/v1/uploads')
        .send({ purpose: 'AVATAR', contentType: 'image/png', size: 1000 })
        .expect(201);

      expect(uploadTicketSchema.parse(res.body).key).toMatch(
        new RegExp(`^uploads/${user.id}/avatars/`),
      );
    });
  });
});
