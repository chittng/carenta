import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';

import {
  apiErrorSchema,
  authUserSchema,
  ErrorCode,
  myProfileSchema,
  publicProfileSchema,
  uploadTicketSchema,
} from '@carenta/shared';

import { type ActorRole, type BookingStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const profileOf = (res: request.Response) => myProfileSchema.parse(res.body);

/**
 * Profiles over HTTP against Postgres and RustFS (real avatar uploads). Needs
 * `docker compose up -d` and `pnpm db:migrate`; run with INTEGRATION=1.
 */
describe.runIf(process.env.INTEGRATION === '1')('user profiles', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const emails: string[] = [];
  const tag = randomUUID().slice(0, 8);
  let makeId: number;
  let modelId: number;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const make = await prisma.carMake.create({
      data: {
        name: `Profile ${tag}`,
        slug: `profile-${tag}`,
        models: { create: [{ name: 'Model', slug: 'model' }] },
      },
      include: { models: true },
    });
    makeId = make.id;
    modelId = make.models[0]!.id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.review.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.booking.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.car.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.carModel.deleteMany({ where: { makeId } });
    await prisma.carMake.delete({ where: { id: makeId } });
    await app.close();
  });

  async function signUp(fullName = 'Người Dùng') {
    const agent = request.agent(app.getHttpServer());
    const email = `profile-${randomUUID()}@example.com`;
    emails.push(email);
    const res = await agent
      .post('/api/v1/auth/register')
      .send({ email, password: 'mat khau', fullName })
      .expect(201);
    return { agent, user: authUserSchema.parse(res.body), email };
  }

  type Agent = Awaited<ReturnType<typeof signUp>>['agent'];

  async function createCar(ownerId: string) {
    return prisma.car.create({
      data: {
        ownerId,
        modelId,
        year: 2022,
        licensePlate: `98Y-${randomUUID().replace(/\D/g, '').padEnd(5, '0').slice(0, 5)}`,
        color: 'Trắng',
        bodyType: 'SEDAN',
        seats: 5,
        transmission: 'AUTOMATIC',
        fuelType: 'GASOLINE',
        odometerKm: 1000,
        province: 'Hà Nội',
        ward: 'Phường Hoàn Kiếm',
        addressLine: '1 Tràng Tiền',
        latitude: 21.025,
        longitude: 105.855,
      },
    });
  }

  const publicProfile = async (id: string) =>
    publicProfileSchema.parse(
      (await request(app.getHttpServer()).get(`/api/v1/users/${id}`).expect(200)).body,
    );

  async function uploadAvatar(agent: Agent) {
    const body = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#cc6633' },
    })
      .jpeg()
      .toBuffer();
    const res = await agent
      .post('/api/v1/uploads')
      .send({ purpose: 'AVATAR', contentType: 'image/jpeg', size: body.length })
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

  describe('my profile', () => {
    it('needs a signed-in user', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/me/profile');

      expect(res.status).toBe(401);
    });

    it('shows and edits name and phone, even before the email is verified', async () => {
      const { agent, user, email } = await signUp();

      const initial = profileOf(await agent.get('/api/v1/me/profile').expect(200));
      expect(initial).toMatchObject({
        id: user.id,
        email,
        emailVerified: false,
        fullName: 'Người Dùng',
        phone: null,
        avatarUrl: null,
        dateOfBirth: null,
      });

      const edited = profileOf(
        await agent
          .patch('/api/v1/me/profile')
          .send({ fullName: '  Nguyễn Văn A ', phone: '+84 912.345.678' })
          .expect(200),
      );
      expect(edited).toMatchObject({ fullName: 'Nguyễn Văn A', phone: '0912345678' });

      const cleared = profileOf(
        await agent.patch('/api/v1/me/profile').send({ phone: '' }).expect(200),
      );
      expect(cleared).toMatchObject({ fullName: 'Nguyễn Văn A', phone: null });

      const invalid = await agent
        .patch('/api/v1/me/profile')
        .send({ phone: '028 3822 1234' })
        .expect(400);
      expect(apiErrorSchema.parse(invalid.body).details).toEqual([
        { path: 'phone', message: 'Số điện thoại không hợp lệ. Ví dụ: 0912 345 678' },
      ]);
    });

    it('takes the birth date from the submitted driver license', async () => {
      const { agent, user } = await signUp();
      await prisma.driverLicense.create({
        data: {
          userId: user.id,
          fullName: 'NGUYEN VAN A',
          licenseNumber: '012345678901',
          licenseClass: 'B',
          dateOfBirth: new Date('1995-04-30T00:00:00.000Z'),
          frontImageKey: 'driver-licenses/front.jpg',
          backImageKey: 'driver-licenses/back.jpg',
        },
      });

      const profile = profileOf(await agent.get('/api/v1/me/profile').expect(200));

      expect(profile.dateOfBirth).toBe('1995-04-30');
    });

    it('replaces and removes the avatar, deleting the old files', async () => {
      const { agent } = await signUp();

      const first = profileOf(
        await agent
          .put('/api/v1/me/profile/avatar')
          .send({ uploadKey: await uploadAvatar(agent) })
          .expect(200),
      );
      const firstUrl = first.avatarUrl!;
      expect((await fetch(firstUrl)).status).toBe(200);

      const second = profileOf(
        await agent
          .put('/api/v1/me/profile/avatar')
          .send({ uploadKey: await uploadAvatar(agent) })
          .expect(200),
      );
      expect(second.avatarUrl).not.toBe(firstUrl);
      expect((await fetch(firstUrl)).status).toBe(404);

      const removed = profileOf(await agent.delete('/api/v1/me/profile/avatar').expect(200));
      expect(removed.avatarUrl).toBeNull();
      expect((await fetch(second.avatarUrl!)).status).toBe(404);
    });

    it("refuses someone else's upload", async () => {
      const { agent } = await signUp();
      const uploadKey = await uploadAvatar(agent);

      const res = await (
        await signUp()
      ).agent
        .put('/api/v1/me/profile/avatar')
        .send({ uploadKey })
        .expect(404);

      expect(apiErrorSchema.parse(res.body).code).toBe(ErrorCode.UPLOAD_NOT_FOUND);
    });
  });

  describe('public profile', () => {
    let slot = 0;

    /**
     * A booking in its final state, with the log line for how it left PENDING_APPROVAL
     * when it was a booking request. What the state machine will write (CARENTA-29).
     */
    async function createBooking(
      carId: string,
      ownerId: string,
      renterId: string,
      status: BookingStatus,
      { requestAnsweredBy, createdAt }: { requestAnsweredBy?: ActorRole; createdAt?: Date } = {},
    ) {
      slot += 1;
      const startAt = new Date(Date.UTC(2026, 0, 1) + slot * 3 * DAY_MS);
      const booking = await prisma.booking.create({
        data: {
          carId,
          ownerId,
          renterId,
          status,
          startAt,
          endAt: new Date(startAt.getTime() + DAY_MS),
          blockedUntil: new Date(startAt.getTime() + DAY_MS),
          pickupMethod: 'SELF_PICKUP',
          pricingSnapshot: {},
          priceBreakdown: [],
          rentalAmount: 800_000,
          deliveryFee: 0,
          depositAmount: 5_000_000,
          totalAmount: 5_800_000,
          commissionRatePercent: 15,
          commissionAmount: 120_000,
          termsAcceptedAt: startAt,
          approvalDeadlineAt: requestAnsweredBy ? startAt : null,
          createdAt,
        },
      });
      if (requestAnsweredBy) {
        await prisma.bookingStatusLog.create({
          data: {
            bookingId: booking.id,
            fromStatus: 'PENDING_APPROVAL',
            toStatus: requestAnsweredBy === 'OWNER' ? 'AWAITING_PAYMENT' : 'CANCELLED',
            actorRole: requestAnsweredBy,
          },
        });
      }
      return booking;
    }

    it('shows a new user with no trips, reviews or requests', async () => {
      const { user } = await signUp('Người Mới');

      const { joinedAt, ...profile } = await publicProfile(user.id);

      expect(Number.isNaN(Date.parse(joinedAt))).toBe(false);
      expect(profile).toEqual({
        id: user.id,
        fullName: 'Người Mới',
        avatarUrl: null,
        tripCount: 0,
        rating: { average: null, count: 0 },
        responseRate: null,
      });
      expect(profile).not.toHaveProperty('email');
      expect(profile).not.toHaveProperty('phone');
    });

    it('counts completed trips, published reviews and answered booking requests', async () => {
      const owner = (await signUp('Chủ Xe')).user;
      const renter = (await signUp('Người Thuê')).user;
      const car = await createCar(owner.id);

      const completed = await createBooking(car.id, owner.id, renter.id, 'COMPLETED');
      const second = await createBooking(car.id, owner.id, renter.id, 'COMPLETED', {
        requestAnsweredBy: 'OWNER',
      });
      await createBooking(car.id, owner.id, renter.id, 'CANCELLED', { requestAnsweredBy: 'OWNER' });
      await createBooking(car.id, owner.id, renter.id, 'CANCELLED', {
        requestAnsweredBy: 'SYSTEM',
      });
      // Withdrawn by the renter before the owner answered: not counted.
      await createBooking(car.id, owner.id, renter.id, 'CANCELLED', {
        requestAnsweredBy: 'RENTER',
      });
      // Older than 90 days: not counted.
      await createBooking(car.id, owner.id, renter.id, 'CANCELLED', {
        requestAnsweredBy: 'SYSTEM',
        createdAt: new Date(Date.now() - 91 * DAY_MS),
      });

      const published = {
        direction: 'RENTER_TO_OWNER',
        authorId: renter.id,
        subjectUserId: owner.id,
        publishedAt: new Date(),
      } as const;
      await prisma.review.createMany({
        data: [
          { ...published, bookingId: completed.id, rating: 5 },
          { ...published, bookingId: second.id, rating: 4 },
        ],
      });
      // Not published yet: hidden until both sides have reviewed (spec §9).
      await prisma.review.create({
        data: {
          bookingId: completed.id,
          direction: 'OWNER_TO_RENTER',
          authorId: owner.id,
          subjectUserId: renter.id,
          rating: 1,
        },
      });

      expect(await publicProfile(owner.id)).toMatchObject({
        tripCount: 2,
        rating: { average: 4.5, count: 2 },
        responseRate: 67,
      });
      expect(await publicProfile(renter.id)).toMatchObject({
        tripCount: 2,
        rating: { average: null, count: 0 },
        responseRate: null,
      });
    });

    it('hides locked accounts, admins and unknown ids', async () => {
      const locked = (await signUp()).user;
      await prisma.user.update({ where: { id: locked.id }, data: { status: 'LOCKED' } });
      const admin = (await signUp()).user;
      await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });

      for (const id of [locked.id, admin.id, randomUUID()]) {
        // oxlint-disable-next-line no-await-in-loop
        const res = await request(app.getHttpServer()).get(`/api/v1/users/${id}`).expect(404);
        expect(apiErrorSchema.parse(res.body).code).toBe(ErrorCode.NOT_FOUND);
      }
      await request(app.getHttpServer()).get('/api/v1/users/not-a-uuid').expect(400);
    });
  });
});
