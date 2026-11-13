import { randomInt, randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import sharp from 'sharp';
import request from 'supertest';
import { z } from 'zod';

import {
  amenitySchema,
  apiErrorSchema,
  authUserSchema,
  carMakeSchema,
  ErrorCode,
  ownerCarSchema,
  ownerCarSummarySchema,
  uploadTicketSchema,
  vietnamDate,
} from '@carenta/shared';

import { PrismaService } from '../src/prisma/prisma.service.js';
import { UploadsService } from '../src/storage/uploads.service.js';
import { createTestApp } from './create-test-app.js';

const errorOf = (res: request.Response) => apiErrorSchema.parse(res.body);
const carOf = (res: request.Response) => ownerCarSchema.parse(res.body);

/** A normalised plate no other test run is likely to hold: 99X-xxx.xx */
const randomPlate = () => {
  const digits = String(randomInt(0, 100_000)).padStart(5, '0');
  return `99X-${digits.slice(0, 3)}.${digits.slice(3)}`;
};
const nextYear = () => `${Number(vietnamDate().slice(0, 4)) + 1}-12-31`;

/**
 * Owner car management over HTTP against Postgres and RustFS (real uploads). Needs
 * `docker compose up -d` and `pnpm db:migrate`; run with INTEGRATION=1.
 */
describe.runIf(process.env.INTEGRATION === '1')('owner cars', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let uploads: UploadsService;
  const emails: string[] = [];
  const tag = randomUUID().slice(0, 8);
  let makeId: number;
  let modelId: number;
  let otherModelId: number;
  let amenityIds: number[];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    uploads = app.get(UploadsService);

    // Own catalogue rows, so the test does not depend on the seed.
    const make = await prisma.carMake.create({
      data: {
        name: `Test ${tag}`,
        slug: `test-${tag}`,
        models: {
          create: [
            { name: 'Alpha', slug: 'alpha' },
            { name: 'Beta', slug: 'beta' },
            { name: 'Retired', slug: 'retired', isActive: false },
          ],
        },
      },
      include: { models: { orderBy: { name: 'asc' } } },
    });
    makeId = make.id;
    const modelIdOf = (slug: string) => make.models.find((m) => m.slug === slug)?.id ?? 0;
    modelId = modelIdOf('alpha');
    otherModelId = modelIdOf('beta');
    const amenities = await Promise.all(
      ['A', 'B'].map((suffix, index) =>
        prisma.amenity.create({
          data: { code: `TEST_${tag}_${suffix}`, name: `Tiện nghi ${suffix}`, sortOrder: index },
        }),
      ),
    );
    amenityIds = amenities.map((a) => a.id);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ownerIds = users.map((u) => u.id);
    const [photos, documents] = await Promise.all([
      prisma.carPhoto.findMany({ where: { car: { ownerId: { in: ownerIds } } } }),
      prisma.carDocument.findMany({ where: { car: { ownerId: { in: ownerIds } } } }),
    ]);
    await Promise.allSettled([
      ...photos.map((p) => uploads.remove('CAR_PHOTO', p.fileKey)),
      ...documents.map((d) => uploads.remove('CAR_DOCUMENT', d.fileKey)),
    ]);
    await prisma.car.deleteMany({ where: { ownerId: { in: ownerIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ownerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
    await prisma.carModel.deleteMany({ where: { makeId } });
    await prisma.carMake.delete({ where: { id: makeId } });
    await prisma.amenity.deleteMany({ where: { id: { in: amenityIds } } });
    await app.close();
  });

  /** A signed-in user with a verified email (or not), as a cookie-keeping agent. */
  async function signUp({ verified = true } = {}) {
    const agent = request.agent(app.getHttpServer());
    const email = `cars-${randomUUID()}@example.com`;
    emails.push(email);
    const res = await agent
      .post('/api/v1/auth/register')
      .send({ email, password: 'mat khau', fullName: 'Chủ Xe' })
      .expect(201);
    const user = authUserSchema.parse(res.body);
    if (verified) {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    }
    return { agent, user };
  }

  type Agent = Awaited<ReturnType<typeof signUp>>['agent'];

  const newCar = (overrides: Record<string, unknown> = {}) => ({
    modelId,
    year: 2022,
    licensePlate: randomPlate(),
    color: 'Trắng',
    bodyType: 'SEDAN',
    seats: 5,
    transmission: 'AUTOMATIC',
    fuelType: 'GASOLINE',
    odometerKm: 25_000,
    location: {
      province: 'TP. Hồ Chí Minh',
      ward: 'Phường Bến Thành',
      addressLine: '12 Lê Lợi',
      latitude: 10.7721,
      longitude: 106.6983,
    },
    ...overrides,
  });

  async function createCar(agent: Agent, overrides: Record<string, unknown> = {}) {
    return carOf(await agent.post('/api/v1/owner/cars').send(newCar(overrides)).expect(201));
  }

  /** Does what the browser does: asks for a ticket, then PUTs a real JPEG to RustFS. */
  async function upload(agent: Agent, purpose: 'CAR_PHOTO' | 'CAR_DOCUMENT') {
    const body = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#3366cc' },
    })
      .jpeg()
      .toBuffer();
    const res = await agent
      .post('/api/v1/uploads')
      .send({ purpose, contentType: 'image/jpeg', size: body.length })
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

  async function addPhotos(agent: Agent, carId: string, count: number) {
    let car = carOf(await agent.get(`/api/v1/owner/cars/${carId}`).expect(200));
    for (let i = 0; i < count; i += 1) {
      // oxlint-disable-next-line no-await-in-loop -- photos are appended in order
      const uploadKey = await upload(agent, 'CAR_PHOTO');
      // oxlint-disable-next-line no-await-in-loop
      const res = await agent.post(`/api/v1/owner/cars/${carId}/photos`).send({ uploadKey });
      expect(res.status).toBe(201);
      car = carOf(res);
    }
    return car;
  }

  async function putDocument(
    agent: Agent,
    carId: string,
    type: 'REGISTRATION' | 'INSPECTION',
    { expiresOn, status = 200 }: { expiresOn?: string; status?: number } = {},
  ) {
    const uploadKey = await upload(agent, 'CAR_DOCUMENT');
    return agent
      .put(`/api/v1/owner/cars/${carId}/documents/${type}`)
      .send({ uploadKey, expiresOn })
      .expect(status);
  }

  /** A car that passed review: what Console will do in CARENTA-15. */
  async function approvedCar(agent: Agent) {
    const car = await createCar(agent);
    await addPhotos(agent, car.id, 4);
    await putDocument(agent, car.id, 'REGISTRATION');
    await putDocument(agent, car.id, 'INSPECTION', { expiresOn: nextYear() });
    await agent.post(`/api/v1/owner/cars/${car.id}/submit`).expect(200);
    await prisma.car.update({ where: { id: car.id }, data: { status: 'ACTIVE' } });
    return car;
  }

  describe('catalogue', () => {
    it('lists active makes, models and amenities without signing in', async () => {
      const makes = z
        .array(carMakeSchema)
        .parse((await request(app.getHttpServer()).get('/api/v1/car-makes').expect(200)).body);
      expect(makes.find((m) => m.id === makeId)?.models.map((m) => m.name)).toEqual([
        'Alpha',
        'Beta',
      ]);

      const amenities = z
        .array(amenitySchema)
        .parse((await request(app.getHttpServer()).get('/api/v1/amenities').expect(200)).body);
      expect(amenities.filter((a) => amenityIds.includes(a.id)).map((a) => a.name)).toEqual([
        'Tiện nghi A',
        'Tiện nghi B',
      ]);
    });
  });

  describe('drafts', () => {
    it('needs a verified email', async () => {
      const { agent } = await signUp({ verified: false });

      const res = await agent.post('/api/v1/owner/cars').send(newCar()).expect(403);

      expect(errorOf(res).code).toBe(ErrorCode.EMAIL_NOT_VERIFIED);
    });

    it('saves a draft with normalised details, visible only to its owner', async () => {
      const { agent } = await signUp();
      const plate = randomPlate();

      const car = await createCar(agent, {
        licensePlate: plate.toLowerCase().replace(/[-.]/g, ' '),
        amenityIds: [amenityIds[1], amenityIds[0]],
        mileageLimit: { dailyKm: 300, extraFeePerKm: 5000 },
      });

      expect(car).toMatchObject({
        status: 'DRAFT',
        licensePlate: plate,
        make: { id: makeId },
        model: { id: modelId, name: 'Alpha' },
        rules: { noSmoking: false, note: null },
        mileageLimit: { dailyKm: 300, extraFeePerKm: 5000 },
        location: { latitude: 10.7721, longitude: 106.6983 },
        photos: [],
        documents: [],
        revision: null,
      });
      expect(car.amenities.map((a) => a.name)).toEqual(['Tiện nghi A', 'Tiện nghi B']);

      const list = z
        .array(ownerCarSummarySchema)
        .parse((await agent.get('/api/v1/owner/cars').expect(200)).body);
      expect(list).toEqual([
        expect.objectContaining({ id: car.id, photoCount: 0, coverPhoto: null }),
      ]);

      const stranger = (await signUp()).agent;
      await stranger.get(`/api/v1/owner/cars/${car.id}`).expect(404);
      await stranger.patch(`/api/v1/owner/cars/${car.id}`).send({ color: 'Đỏ' }).expect(404);
      await stranger.delete(`/api/v1/owner/cars/${car.id}`).expect(404);
    });

    it('refuses a plate that is already listed', async () => {
      const { agent } = await signUp();
      const car = await createCar(agent);

      const res = await (
        await signUp()
      ).agent
        .post('/api/v1/owner/cars')
        .send(newCar({ licensePlate: car.licensePlate }))
        .expect(409);

      expect(errorOf(res).code).toBe(ErrorCode.LICENSE_PLATE_TAKEN);
    });

    it('refuses models and amenities outside the active catalogue', async () => {
      const { agent } = await signUp();
      const retired = await prisma.carModel.findFirstOrThrow({
        where: { makeId, slug: 'retired' },
      });

      const res = await agent
        .post('/api/v1/owner/cars')
        .send(newCar({ modelId: retired.id, amenityIds: [amenityIds[0], 999_999] }))
        .expect(422);

      expect(errorOf(res)).toMatchObject({
        code: ErrorCode.CATALOG_ITEM_NOT_FOUND,
        details: [{ path: 'modelId' }],
      });
    });

    it('edits a draft directly, including the plate and the model', async () => {
      const { agent } = await signUp();
      const car = await createCar(agent);
      const plate = randomPlate();

      const updated = carOf(
        await agent
          .patch(`/api/v1/owner/cars/${car.id}`)
          .send({ licensePlate: plate, modelId: otherModelId, description: 'Xe gia đình' })
          .expect(200),
      );

      expect(updated).toMatchObject({
        licensePlate: plate,
        model: { name: 'Beta' },
        description: 'Xe gia đình',
        revision: null,
      });
    });

    it('deletes a draft with its photos', async () => {
      const { agent } = await signUp();
      const car = await createCar(agent);
      const withPhoto = await addPhotos(agent, car.id, 1);
      const photoUrl = withPhoto.photos[0]!.urls.sm;
      expect((await fetch(photoUrl)).status).toBe(200);

      await agent.delete(`/api/v1/owner/cars/${car.id}`).expect(204);

      expect(await prisma.car.findUnique({ where: { id: car.id } })).toBeNull();
      expect((await fetch(photoUrl)).status).toBe(404);
    });
  });

  describe('submitting for review', () => {
    it('lists what is missing, then sends a complete car to the queue', async () => {
      const { agent } = await signUp();
      const car = await createCar(agent);

      const early = await agent.post(`/api/v1/owner/cars/${car.id}/submit`).expect(422);
      expect(errorOf(early)).toMatchObject({ code: ErrorCode.CAR_INCOMPLETE });
      expect(errorOf(early).details?.map((d) => d.path)).toEqual([
        'photos',
        'documents.REGISTRATION',
        'documents.INSPECTION',
      ]);

      const withPhotos = await addPhotos(agent, car.id, 4);
      const reversed = withPhotos.photos.map((p) => p.id).toReversed();
      const reordered = carOf(
        await agent
          .put(`/api/v1/owner/cars/${car.id}/photos/order`)
          .send({ photoIds: reversed })
          .expect(200),
      );
      expect(reordered.photos.map((p) => p.id)).toEqual(reversed);
      expect(reordered.photos.map((p) => p.position)).toEqual([0, 1, 2, 3]);

      await putDocument(agent, car.id, 'REGISTRATION');
      const noExpiry = await putDocument(agent, car.id, 'INSPECTION', { status: 400 });
      expect(errorOf(noExpiry).details).toEqual([
        { path: 'expiresOn', message: 'Vui lòng nhập ngày hết hạn đăng kiểm.' },
      ]);
      const withDocs = carOf(
        await putDocument(agent, car.id, 'INSPECTION', { expiresOn: nextYear() }),
      );
      expect(withDocs.documents.map((d) => [d.type, d.expiresOn])).toEqual([
        ['REGISTRATION', null],
        ['INSPECTION', nextYear()],
      ]);
      // Private: only through the presigned URL.
      expect((await fetch(withDocs.documents[0]!.url)).status).toBe(200);

      const submitted = carOf(await agent.post(`/api/v1/owner/cars/${car.id}/submit`).expect(200));
      expect(submitted.status).toBe('PENDING_REVIEW');
      expect(submitted.submittedAt).not.toBeNull();

      const again = await agent.post(`/api/v1/owner/cars/${car.id}/submit`).expect(409);
      expect(errorOf(again).code).toBe(ErrorCode.CAR_STATUS_CONFLICT);
      await agent.delete(`/api/v1/owner/cars/${car.id}`).expect(409);
    });

    it('replaces a document of a car that was never approved', async () => {
      const { agent } = await signUp();
      const car = await createCar(agent);
      const first = carOf(await putDocument(agent, car.id, 'REGISTRATION'));

      const second = carOf(await putDocument(agent, car.id, 'REGISTRATION'));

      expect(second.documents).toHaveLength(1);
      expect(second.documents[0]!.id).not.toBe(first.documents[0]!.id);
    });

    it('caps a car at 15 photos', async () => {
      const { agent } = await signUp();
      const car = await createCar(agent);
      await prisma.carPhoto.createMany({
        data: Array.from({ length: 15 }, (_, position) => ({
          carId: car.id,
          fileKey: `car-photos/${randomUUID()}`,
          position,
        })),
      });

      const res = await agent
        .post(`/api/v1/owner/cars/${car.id}/photos`)
        .send({ uploadKey: await upload(agent, 'CAR_PHOTO') })
        .expect(409);

      expect(errorOf(res).code).toBe(ErrorCode.CAR_PHOTO_LIMIT);
    });
  });

  describe('approved cars', () => {
    it('keeps showing the current plate and model while changes wait for review', async () => {
      const { agent } = await signUp();
      const car = await approvedCar(agent);
      const newPlate = randomPlate();

      const edited = carOf(
        await agent
          .patch(`/api/v1/owner/cars/${car.id}`)
          .send({ licensePlate: newPlate, color: 'Đen' })
          .expect(200),
      );
      expect(edited).toMatchObject({
        status: 'ACTIVE',
        color: 'Đen',
        licensePlate: car.licensePlate,
        revision: { status: 'PENDING', licensePlate: newPlate, year: null, model: null },
      });

      // Further edits overwrite the same pending revision.
      const more = carOf(
        await agent
          .patch(`/api/v1/owner/cars/${car.id}`)
          .send({ year: 2020, modelId: otherModelId })
          .expect(200),
      );
      expect(more.revision).toMatchObject({
        id: edited.revision?.id,
        licensePlate: newPlate,
        year: 2020,
        make: { id: makeId },
        model: { name: 'Beta' },
      });
      expect(more).toMatchObject({ year: 2022, model: { name: 'Alpha' } });

      // Another owner cannot claim a plate that a pending revision asks for.
      const taken = await (
        await signUp()
      ).agent
        .post('/api/v1/owner/cars')
        .send(newCar({ licensePlate: newPlate }))
        .expect(409);
      expect(errorOf(taken).code).toBe(ErrorCode.LICENSE_PLATE_TAKEN);

      // Setting a field back to the current value drops that change.
      const reverted = carOf(
        await agent
          .patch(`/api/v1/owner/cars/${car.id}`)
          .send({ licensePlate: car.licensePlate, year: 2022, modelId })
          .expect(200),
      );
      expect(reverted.revision).toBeNull();
      expect(await prisma.carRevision.count({ where: { carId: car.id } })).toBe(0);
    });

    it('puts a new document into the revision until it is approved', async () => {
      const { agent } = await signUp();
      const car = await approvedCar(agent);
      const before = carOf(await agent.get(`/api/v1/owner/cars/${car.id}`).expect(200));

      const after = carOf(
        await putDocument(agent, car.id, 'INSPECTION', { expiresOn: nextYear() }),
      );

      expect(after.documents.map((d) => d.id)).toEqual(before.documents.map((d) => d.id));
      expect(after.revision?.documents.map((d) => d.type)).toEqual(['INSPECTION']);

      const cancelled = carOf(
        await agent.delete(`/api/v1/owner/cars/${car.id}/revision`).expect(200),
      );
      expect(cancelled.revision).toBeNull();
      expect(cancelled.documents.map((d) => d.id)).toEqual(before.documents.map((d) => d.id));
      await agent.delete(`/api/v1/owner/cars/${car.id}/revision`).expect(404);
    });

    it('keeps at least 4 photos, can be paused and resumed, but not deleted', async () => {
      const { agent } = await signUp();
      const car = await approvedCar(agent);
      const current = carOf(await agent.get(`/api/v1/owner/cars/${car.id}`).expect(200));

      const tooFew = await agent
        .delete(`/api/v1/owner/cars/${car.id}/photos/${current.photos[0]!.id}`)
        .expect(409);
      expect(errorOf(tooFew).code).toBe(ErrorCode.CAR_PHOTO_LIMIT);

      const withFifth = await addPhotos(agent, car.id, 1);
      const removed = carOf(
        await agent
          .delete(`/api/v1/owner/cars/${car.id}/photos/${withFifth.photos[0]!.id}`)
          .expect(200),
      );
      expect(removed.photos.map((p) => p.position)).toEqual([0, 1, 2, 3]);
      expect(removed.photos[0]!.id).toBe(withFifth.photos[1]!.id);

      const paused = carOf(await agent.post(`/api/v1/owner/cars/${car.id}/pause`).expect(200));
      expect(paused.status).toBe('PAUSED');
      await agent.post(`/api/v1/owner/cars/${car.id}/pause`).expect(409);
      const resumed = carOf(await agent.post(`/api/v1/owner/cars/${car.id}/resume`).expect(200));
      expect(resumed.status).toBe('ACTIVE');

      const del = await agent.delete(`/api/v1/owner/cars/${car.id}`).expect(409);
      expect(errorOf(del).code).toBe(ErrorCode.CAR_STATUS_CONFLICT);
    });

    it('cannot be edited once removed by an admin', async () => {
      const { agent } = await signUp();
      const car = await createCar(agent);
      await prisma.car.update({ where: { id: car.id }, data: { status: 'REMOVED' } });

      const res = await agent
        .patch(`/api/v1/owner/cars/${car.id}`)
        .send({ color: 'Đỏ' })
        .expect(409);

      expect(errorOf(res).code).toBe(ErrorCode.CAR_STATUS_CONFLICT);
    });
  });
});
