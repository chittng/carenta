import { randomInt, randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { z } from 'zod';

import {
  apiErrorSchema,
  authUserSchema,
  carMakeSchema,
  consoleAmenitySchema,
  consoleCarMakeSchema,
  consoleCarModelSchema,
  consoleCarSchema,
  consoleCarSummarySchema,
  consoleRevisionSummarySchema,
  consoleUserSchema,
  consoleUserSummarySchema,
  ErrorCode,
  ownerCarSchema,
  pageOf,
} from '@carenta/shared';

import { type CarStatus } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';

const PASSWORD = 'mat khau';
const errorOf = (res: request.Response) => apiErrorSchema.parse(res.body);
const consoleCarOf = (res: request.Response) => consoleCarSchema.parse(res.body);
const consoleUserOf = (res: request.Response) => consoleUserSchema.parse(res.body);

/** A normalised plate unlikely to be taken: 97Z-xxx.xx */
const randomPlate = () => {
  const digits = String(randomInt(0, 100_000)).padStart(5, '0');
  return `97Z-${digits.slice(0, 3)}.${digits.slice(3)}`;
};
const nextYear = () => new Date(Date.UTC(new Date().getUTCFullYear() + 1, 11, 31));

/**
 * Console over HTTP against Postgres (spec §11). Cars are seeded straight into the
 * database; emails are checked through the Notification log. Run with INTEGRATION=1.
 */
describe.runIf(process.env.INTEGRATION === '1')('console', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const emails: string[] = [];
  const tag = randomUUID().slice(0, 8);
  const makeIds: number[] = [];
  const amenityIds: number[] = [];
  let modelId: number;
  let otherModelId: number;
  let admin: Agent;
  let adminId: string;

  type Agent = ReturnType<typeof request.agent>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const make = await prisma.carMake.create({
      data: {
        name: `Console ${tag}`,
        slug: `console-${tag}`,
        models: {
          create: [
            { name: 'Alpha', slug: 'alpha' },
            { name: 'Beta', slug: 'beta' },
          ],
        },
      },
      include: { models: { orderBy: { name: 'asc' } } },
    });
    makeIds.push(make.id);
    modelId = make.models[0]!.id;
    otherModelId = make.models[1]!.id;
    ({ agent: admin, id: adminId } = await signUp('Quản Trị'));
    await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.car.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.carModel.deleteMany({ where: { makeId: { in: makeIds } } });
    await prisma.carMake.deleteMany({ where: { id: { in: makeIds } } });
    await prisma.amenity.deleteMany({ where: { id: { in: amenityIds } } });
    await app.close();
  });

  async function signUp(fullName = 'Chủ Xe') {
    const agent = request.agent(app.getHttpServer());
    const email = `console-${randomUUID()}@example.com`;
    emails.push(email);
    const res = await agent
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName })
      .expect(201);
    const { id } = authUserSchema.parse(res.body);
    await prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
    return { agent, id, email };
  }

  /** A car straight in the database, complete enough to be approved unless told otherwise. */
  async function seedCar(
    ownerId: string,
    {
      status = 'PENDING_REVIEW',
      photos = 4,
      submittedAt = new Date(),
    }: {
      status?: CarStatus;
      photos?: number;
      submittedAt?: Date;
    } = {},
  ) {
    return prisma.car.create({
      data: {
        ownerId,
        modelId,
        year: 2021,
        licensePlate: randomPlate(),
        color: 'Đen',
        bodyType: 'SUV',
        seats: 7,
        transmission: 'AUTOMATIC',
        fuelType: 'DIESEL',
        odometerKm: 40_000,
        province: 'Đà Nẵng',
        ward: 'Phường Hải Châu',
        addressLine: '1 Bạch Đằng',
        latitude: 16.07,
        longitude: 108.22,
        status,
        submittedAt,
        pricing: { create: { dailyPrice: 900_000, minDurationHours: 24, maxDurationDays: 30 } },
        photos: {
          create: Array.from({ length: photos }, (_, position) => ({
            fileKey: `car-photos/${randomUUID()}`,
            position,
          })),
        },
        documents: {
          create: [
            { type: 'REGISTRATION', fileKey: `car-documents/${randomUUID()}.jpg` },
            {
              type: 'INSPECTION',
              fileKey: `car-documents/${randomUUID()}.jpg`,
              expiresOn: nextYear(),
            },
          ],
        },
      },
    });
  }

  const emailsSent = (userId: string) =>
    prisma.notification
      .findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { template: true } })
      .then((rows) => rows.map((row) => row.template));

  describe('access', () => {
    it('is for admins only', async () => {
      const res = await (await signUp()).agent.get('/api/v1/console/cars').expect(403);
      expect(errorOf(res).code).toBe(ErrorCode.FORBIDDEN);

      const anonymous = await request(app.getHttpServer()).get('/api/v1/console/users');
      expect(anonymous.status).toBe(401);
    });
  });

  describe('car review', () => {
    it('lists the queue oldest first and approves a complete car', async () => {
      const owner = await signUp();
      const older = await seedCar(owner.id, { submittedAt: new Date(Date.now() - 60_000) });
      const newer = await seedCar(owner.id);

      const queue = pageOf(consoleCarSummarySchema).parse(
        (
          await admin
            .get('/api/v1/console/cars')
            .query({ status: 'PENDING_REVIEW', q: owner.email })
        ).body,
      );
      expect(queue.items.map((car) => car.id)).toEqual([older.id, newer.id]);
      expect(queue).toMatchObject({ page: 1, pageSize: 20, total: 2 });

      const byPlate = pageOf(consoleCarSummarySchema).parse(
        (
          await admin
            .get('/api/v1/console/cars')
            .query({ q: older.licensePlate.toLowerCase() })
            .expect(200)
        ).body,
      );
      expect(byPlate.items.map((car) => car.id)).toContain(older.id);

      const detail = consoleCarOf(await admin.get(`/api/v1/console/cars/${older.id}`).expect(200));
      expect(detail.owner).toMatchObject({ id: owner.id, email: owner.email, status: 'ACTIVE' });
      expect(detail.documents.map((d) => d.type)).toEqual(['REGISTRATION', 'INSPECTION']);

      const approved = consoleCarOf(
        await admin.post(`/api/v1/console/cars/${older.id}/approve`).expect(200),
      );
      expect(approved).toMatchObject({
        status: 'ACTIVE',
        rejectionReason: null,
        reviewedBy: { id: adminId },
      });
      expect(approved.reviewedAt).not.toBeNull();
      expect(await emailsSent(owner.id)).toContain('car.approved');

      const again = await admin.post(`/api/v1/console/cars/${older.id}/approve`).expect(409);
      expect(errorOf(again).code).toBe(ErrorCode.CAR_STATUS_CONFLICT);
    });

    it('re-checks the car before approving it', async () => {
      const owner = await signUp();
      const car = await seedCar(owner.id, { photos: 3 });

      const res = await admin.post(`/api/v1/console/cars/${car.id}/approve`).expect(422);

      expect(errorOf(res)).toMatchObject({
        code: ErrorCode.CAR_INCOMPLETE,
        details: [{ path: 'photos' }],
      });
    });

    it('rejects with a reason the owner can read', async () => {
      const owner = await signUp();
      const car = await seedCar(owner.id);

      const noReason = await admin
        .post(`/api/v1/console/cars/${car.id}/reject`)
        .send({ reason: '  ' })
        .expect(400);
      expect(errorOf(noReason).details).toEqual([
        { path: 'reason', message: 'Vui lòng nhập lý do.' },
      ]);

      await admin
        .post(`/api/v1/console/cars/${car.id}/reject`)
        .send({ reason: 'Ảnh giấy đăng ký bị mờ.' })
        .expect(200);

      const seen = ownerCarSchema.parse(
        (await owner.agent.get(`/api/v1/owner/cars/${car.id}`).expect(200)).body,
      );
      expect(seen).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Ảnh giấy đăng ký bị mờ.',
      });
      expect(await emailsSent(owner.id)).toContain('car.rejected');
    });

    it('applies approved changes, replacing the documents of the same type', async () => {
      const owner = await signUp();
      const car = await seedCar(owner.id, { status: 'ACTIVE' });
      const newPlate = randomPlate();
      await owner.agent
        .patch(`/api/v1/owner/cars/${car.id}`)
        .send({ licensePlate: newPlate, modelId: otherModelId })
        .expect(200);
      const revision = await prisma.carRevision.findFirstOrThrow({ where: { carId: car.id } });
      const newDocumentKey = `car-documents/${randomUUID()}.jpg`;
      await prisma.carDocument.create({
        data: {
          carId: car.id,
          revisionId: revision.id,
          type: 'INSPECTION',
          fileKey: newDocumentKey,
          expiresOn: nextYear(),
        },
      });

      const queue = pageOf(consoleRevisionSummarySchema).parse(
        (await admin.get('/api/v1/console/car-revisions').query({ pageSize: 100 }).expect(200))
          .body,
      );
      expect(queue.items.find((item) => item.id === revision.id)).toMatchObject({
        car: { id: car.id, licensePlate: car.licensePlate, model: { name: 'Alpha' } },
        changes: {
          licensePlate: newPlate,
          model: { name: 'Beta' },
          year: null,
          documentTypes: ['INSPECTION'],
        },
        owner: { id: owner.id },
      });

      const approved = consoleCarOf(
        await admin.post(`/api/v1/console/cars/${car.id}/revision/approve`).expect(200),
      );

      expect(approved).toMatchObject({
        status: 'ACTIVE',
        licensePlate: newPlate,
        model: { name: 'Beta' },
        revision: null,
      });
      const documents = await prisma.carDocument.findMany({
        where: { carId: car.id },
        orderBy: { type: 'asc' },
      });
      expect(documents.map((d) => [d.type, d.revisionId, d.fileKey === newDocumentKey])).toEqual([
        ['REGISTRATION', null, false],
        ['INSPECTION', null, true],
      ]);
      expect(await emailsSent(owner.id)).toContain('car.revision-approved');

      await admin.post(`/api/v1/console/cars/${car.id}/revision/approve`).expect(404);
    });

    it('drops rejected changes and keeps the car as it was', async () => {
      const owner = await signUp();
      const car = await seedCar(owner.id, { status: 'ACTIVE' });
      await owner.agent.patch(`/api/v1/owner/cars/${car.id}`).send({ year: 2023 }).expect(200);

      await admin
        .post(`/api/v1/console/cars/${car.id}/revision/reject`)
        .send({ reason: 'Năm sản xuất không khớp giấy đăng ký.' })
        .expect(200);

      const seen = ownerCarSchema.parse(
        (await owner.agent.get(`/api/v1/owner/cars/${car.id}`).expect(200)).body,
      );
      expect(seen).toMatchObject({
        status: 'ACTIVE',
        year: 2021,
        revision: {
          status: 'REJECTED',
          year: 2023,
          rejectionReason: 'Năm sản xuất không khớp giấy đăng ký.',
        },
      });
      expect(await emailsSent(owner.id)).toContain('car.revision-rejected');
    });

    it('hides a listed car until unhidden, and removes one for good', async () => {
      const owner = await signUp();
      const car = await seedCar(owner.id, { status: 'ACTIVE' });
      const reason = { reason: 'Nhiều phản ánh về tình trạng xe.' };

      const hidden = consoleCarOf(
        await admin.post(`/api/v1/console/cars/${car.id}/hide`).send(reason).expect(200),
      );
      expect(hidden).toMatchObject({ status: 'HIDDEN', rejectionReason: reason.reason });
      // The owner cannot bring it back, but can still edit it.
      await owner.agent.post(`/api/v1/owner/cars/${car.id}/resume`).expect(409);
      await owner.agent.patch(`/api/v1/owner/cars/${car.id}`).send({ color: 'Xám' }).expect(200);

      const shown = consoleCarOf(
        await admin.post(`/api/v1/console/cars/${car.id}/unhide`).expect(200),
      );
      expect(shown).toMatchObject({ status: 'ACTIVE', rejectionReason: null });

      await owner.agent.patch(`/api/v1/owner/cars/${car.id}`).send({ year: 2022 }).expect(200);
      const removed = consoleCarOf(
        await admin.post(`/api/v1/console/cars/${car.id}/remove`).send(reason).expect(200),
      );
      expect(removed).toMatchObject({ status: 'REMOVED', revision: null });
      await admin.post(`/api/v1/console/cars/${car.id}/unhide`).expect(409);
      await owner.agent.patch(`/api/v1/owner/cars/${car.id}`).send({ color: 'Đỏ' }).expect(409);

      expect(await emailsSent(owner.id)).toEqual(
        expect.arrayContaining(['car.hidden', 'car.unhidden', 'car.removed']),
      );
    });

    it('does not hide or remove a car that was never approved', async () => {
      const owner = await signUp();
      const car = await seedCar(owner.id);
      const reason = { reason: 'Không phù hợp.' };

      const hide = await admin.post(`/api/v1/console/cars/${car.id}/hide`).send(reason);
      const remove = await admin.post(`/api/v1/console/cars/${car.id}/remove`).send(reason);
      const unknown = await admin.get(`/api/v1/console/cars/${randomUUID()}`);

      expect([hide.status, remove.status, unknown.status]).toEqual([409, 409, 404]);
      expect(await prisma.car.findUniqueOrThrow({ where: { id: car.id } })).toMatchObject({
        status: 'PENDING_REVIEW',
      });
    });
  });

  describe('users', () => {
    it('finds users and shows their details', async () => {
      const user = await signUp('Trần Tìm Kiếm');
      await prisma.user.update({ where: { id: user.id }, data: { phone: '0912345678' } });
      await seedCar(user.id);

      for (const q of [user.email.slice(0, 20), 'tìm kiếm', '912 345']) {
        // oxlint-disable-next-line no-await-in-loop
        const res = await admin.get('/api/v1/console/users').query({ q }).expect(200);
        const page = pageOf(consoleUserSummarySchema).parse(res.body);
        expect(page.items.map((item) => item.id)).toContain(user.id);
      }

      const detail = consoleUserOf(await admin.get(`/api/v1/console/users/${user.id}`).expect(200));
      expect(detail).toMatchObject({
        fullName: 'Trần Tìm Kiếm',
        phone: '0912345678',
        status: 'ACTIVE',
        emailVerified: true,
        driverLicenseStatus: null,
        carCount: 1,
        bookingCount: { asRenter: 0, asOwner: 0 },
      });
      expect(detail.cars).toHaveLength(1);
    });

    it('locks an account, signing it out everywhere, and unlocks it', async () => {
      const user = await signUp();
      await user.agent.get('/api/v1/auth/me').expect(200);

      const locked = consoleUserOf(
        await admin
          .post(`/api/v1/console/users/${user.id}/lock`)
          .send({ reason: 'Gian lận thanh toán.' })
          .expect(200),
      );
      expect(locked).toMatchObject({ status: 'LOCKED', lockReason: 'Gian lận thanh toán.' });
      expect(locked.lockedAt).not.toBeNull();

      await user.agent.get('/api/v1/auth/me').expect(401);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(403);
      expect(errorOf(login).code).toBe(ErrorCode.ACCOUNT_LOCKED);
      const twice = await admin
        .post(`/api/v1/console/users/${user.id}/lock`)
        .send({ reason: 'x' })
        .expect(409);
      expect(errorOf(twice).code).toBe(ErrorCode.USER_STATUS_CONFLICT);

      const unlocked = consoleUserOf(
        await admin.post(`/api/v1/console/users/${user.id}/unlock`).expect(200),
      );
      expect(unlocked).toMatchObject({ status: 'ACTIVE', lockReason: null, lockedAt: null });
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      await admin.post(`/api/v1/console/users/${user.id}/unlock`).expect(409);

      expect(await emailsSent(user.id)).toEqual(
        expect.arrayContaining(['account.locked', 'account.unlocked']),
      );
    });

    it('does not lock admins', async () => {
      const res = await admin
        .post(`/api/v1/console/users/${adminId}/lock`)
        .send({ reason: 'Thử.' })
        .expect(403);

      expect(errorOf(res).code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('catalogue', () => {
    it('adds, renames and turns off makes and models without deleting them', async () => {
      const make = consoleCarMakeSchema.parse(
        (
          await admin
            .post('/api/v1/console/car-makes')
            .send({ name: `Hãng Đặc Biệt ${tag}` })
            .expect(201)
        ).body,
      );
      makeIds.push(make.id);
      expect(make).toMatchObject({ slug: `hang-dac-biet-${tag}`, isActive: true, models: [] });

      const duplicate = await admin
        .post('/api/v1/console/car-makes')
        .send({ name: `Hãng Đặc Biệt ${tag}` })
        .expect(409);
      expect(errorOf(duplicate).code).toBe(ErrorCode.CATALOG_DUPLICATE);

      const model = consoleCarModelSchema.parse(
        (
          await admin
            .post(`/api/v1/console/car-makes/${make.id}/models`)
            .send({ name: 'Gamma' })
            .expect(201)
        ).body,
      );
      await admin
        .post(`/api/v1/console/car-makes/${make.id}/models`)
        .send({ name: 'Gamma' })
        .expect(409);
      await admin
        .post('/api/v1/console/car-makes/999999999/models')
        .send({ name: 'X' })
        .expect(404);

      const renamed = consoleCarModelSchema.parse(
        (
          await admin
            .patch(`/api/v1/console/car-models/${model.id}`)
            .send({ name: 'Gamma Pro', isActive: false })
            .expect(200)
        ).body,
      );
      expect(renamed).toMatchObject({
        name: 'Gamma Pro',
        slug: 'gamma-pro',
        isActive: false,
        carCount: 0,
      });

      const publicMakes = z
        .array(carMakeSchema)
        .parse((await request(app.getHttpServer()).get('/api/v1/car-makes').expect(200)).body);
      expect(publicMakes.find((m) => m.id === make.id)?.models).toEqual([]);

      const all = z
        .array(consoleCarMakeSchema)
        .parse((await admin.get('/api/v1/console/car-makes').expect(200)).body);
      expect(all.find((m) => m.id === make.id)?.models.map((m) => m.name)).toEqual(['Gamma Pro']);
    });

    it('adds amenities with a fixed code and edits them', async () => {
      const code = `TEST_${tag.toUpperCase()}`;
      const amenity = consoleAmenitySchema.parse(
        (
          await admin
            .post('/api/v1/console/amenities')
            .send({ code, name: 'Tủ lạnh mini' })
            .expect(201)
        ).body,
      );
      amenityIds.push(amenity.id);
      expect(amenity).toMatchObject({ code, sortOrder: 0, isActive: true, carCount: 0 });

      await admin.post('/api/v1/console/amenities').send({ code, name: 'Khác' }).expect(409);
      const badCode = await admin
        .post('/api/v1/console/amenities')
        .send({ code: 'tu-lanh', name: 'Khác' })
        .expect(400);
      expect(errorOf(badCode).details?.[0]?.path).toBe('code');

      const updated = consoleAmenitySchema.parse(
        (
          await admin
            .patch(`/api/v1/console/amenities/${amenity.id}`)
            .send({ sortOrder: 99, isActive: false })
            .expect(200)
        ).body,
      );
      expect(updated).toMatchObject({ code, sortOrder: 99, isActive: false });
      await admin.patch('/api/v1/console/amenities/999999999').send({ name: 'X' }).expect(404);
    });
  });
});
