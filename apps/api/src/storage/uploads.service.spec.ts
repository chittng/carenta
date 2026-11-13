import { randomUUID } from 'node:crypto';

import sharp from 'sharp';

import { ErrorCode, UPLOAD_MAX_BYTES, type UploadPurpose } from '@carenta/shared';

import { type BucketKind, type StorageService, type StoredObject } from './storage.service.js';
import { UploadsService } from './uploads.service.js';

interface FakeObject {
  body: Buffer;
  contentType: string | undefined;
  cacheControl?: string;
}

/** In-memory stand-in for StorageService with the same surface UploadsService uses. */
class FakeStorage {
  readonly objects = new Map<string, FakeObject>();

  put(bucket: BucketKind, key: string, body: Buffer, contentType?: string) {
    this.objects.set(`${bucket}:${key}`, { body, contentType });
  }

  get(bucket: BucketKind, key: string) {
    return this.objects.get(`${bucket}:${key}`);
  }

  keys() {
    return [...this.objects.keys()].toSorted();
  }

  presignUpload(params: { key: string; contentType: string; contentLength: number }) {
    return Promise.resolve({
      url: `http://s3.test/private/${params.key}`,
      headers: { 'Content-Type': params.contentType },
      expiresAt: new Date('2026-11-13T10:10:00Z'),
    });
  }

  presignDownload(key: string) {
    return Promise.resolve(`http://s3.test/private/${key}?signed`);
  }

  publicUrl(key: string) {
    return `http://cdn.test/${key}`;
  }

  stat(bucket: BucketKind, key: string): Promise<StoredObject | null> {
    const object = this.get(bucket, key);
    return Promise.resolve(
      object ? { size: object.body.length, contentType: object.contentType } : null,
    );
  }

  read(bucket: BucketKind, key: string) {
    const object = this.get(bucket, key);
    return object ? Promise.resolve(object.body) : Promise.reject(new Error('NoSuchKey'));
  }

  write(
    bucket: BucketKind,
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl?: string },
  ) {
    this.objects.set(`${bucket}:${key}`, { body, ...options });
    return Promise.resolve();
  }

  copy(
    from: { bucket: BucketKind; key: string },
    to: { bucket: BucketKind; key: string },
    contentType: string,
  ) {
    const object = this.get(from.bucket, from.key);
    if (!object) return Promise.reject(new Error('NoSuchKey'));
    this.objects.set(`${to.bucket}:${to.key}`, { body: object.body, contentType });
    return Promise.resolve();
  }

  delete(bucket: BucketKind, keys: readonly string[]) {
    for (const key of keys) this.objects.delete(`${bucket}:${key}`);
    return Promise.resolve();
  }
}

const USER_ID = '019a7c3e-0000-7000-8000-000000000001';
const OTHER_USER_ID = '019a7c3e-0000-7000-8000-000000000002';

/** A landscape photo with EXIF orientation and GPS, like one straight off a phone. */
function phonePhoto(width = 4000, height = 3000) {
  return sharp({ create: { width, height, channels: 3, background: '#3366aa' } })
    .withExif({
      IFD0: { Make: 'Carenta' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '10/1 46/1 0/1' },
    })
    .jpeg()
    .toBuffer();
}

function setup() {
  const storage = new FakeStorage();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- structural test double
  const uploads = new UploadsService(storage as unknown as StorageService);

  /** Simulates the browser: get a ticket, then PUT the bytes. */
  async function upload(purpose: UploadPurpose, body: Buffer, userId = USER_ID) {
    const ticket = await uploads.createUpload(userId, {
      purpose,
      contentType: 'image/jpeg',
      size: body.length,
    });
    storage.put('private', ticket.key, body, 'image/jpeg');
    return ticket.key;
  }

  return { storage, uploads, upload };
}

describe('UploadsService', () => {
  describe('createUpload', () => {
    it('issues a PUT ticket under the user and purpose prefix', async () => {
      const { uploads } = setup();

      const ticket = await uploads.createUpload(USER_ID, {
        purpose: 'DRIVER_LICENSE',
        contentType: 'image/png',
        size: 1000,
      });

      expect(ticket.key).toMatch(new RegExp(`^uploads/${USER_ID}/driver-licenses/[0-9a-f-]{36}$`));
      expect(ticket).toMatchObject({
        uploadUrl: `http://s3.test/private/${ticket.key}`,
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        expiresAt: '2026-11-13T10:10:00.000Z',
      });
    });
  });

  describe('claim', () => {
    it('resizes a car photo into public WebP variants and consumes the upload', async () => {
      const { storage, uploads, upload } = setup();
      const uploadKey = await upload('CAR_PHOTO', await phonePhoto());

      const key = await uploads.claim(USER_ID, 'CAR_PHOTO', uploadKey);

      expect(key).toMatch(/^car-photos\/[0-9a-f-]{36}$/);
      expect(storage.keys()).toEqual([`public:${key}/lg.webp`, `public:${key}/sm.webp`]);
      const lg = storage.get('public', `${key}/lg.webp`)!;
      expect(lg.contentType).toBe('image/webp');
      expect(lg.cacheControl).toBe('public, max-age=31536000, immutable');
      const lgMeta = await sharp(lg.body).metadata();
      expect([lgMeta.format, lgMeta.width, lgMeta.height]).toEqual(['webp', 1600, 1200]);
      expect(lgMeta.exif).toBeUndefined();
      const smMeta = await sharp(storage.get('public', `${key}/sm.webp`)!.body).metadata();
      expect([smMeta.width, smMeta.height]).toEqual([640, 480]);
    });

    it('does not enlarge small car photos', async () => {
      const { storage, uploads, upload } = setup();
      const key = await uploads.claim(
        USER_ID,
        'CAR_PHOTO',
        await upload('CAR_PHOTO', await phonePhoto(800, 600)),
      );

      const meta = await sharp(storage.get('public', `${key}/lg.webp`)!.body).metadata();
      expect([meta.width, meta.height]).toEqual([800, 600]);
    });

    it('crops avatars to a 256px square', async () => {
      const { storage, uploads, upload } = setup();
      const key = await uploads.claim(
        USER_ID,
        'AVATAR',
        await upload('AVATAR', await phonePhoto()),
      );

      expect(key).toMatch(/^avatars\/[0-9a-f-]{36}$/);
      const meta = await sharp(storage.get('public', `${key}/md.webp`)!.body).metadata();
      expect([meta.width, meta.height]).toEqual([256, 256]);
    });

    it('keeps the original bytes of a driver license privately, typed by its real format', async () => {
      const { storage, uploads, upload } = setup();
      // Declared as JPEG by the browser, actually a PNG.
      const png = await sharp({
        create: { width: 1200, height: 800, channels: 3, background: '#fff' },
      })
        .png()
        .toBuffer();
      const uploadKey = await upload('DRIVER_LICENSE', png);

      const key = await uploads.claim(USER_ID, 'DRIVER_LICENSE', uploadKey);

      expect(key).toMatch(/^driver-licenses\/[0-9a-f-]{36}\.png$/);
      expect(storage.keys()).toEqual([`private:${key}`]);
      expect(storage.get('private', key)).toMatchObject({ body: png, contentType: 'image/png' });
    });

    it('keeps EXIF on trip report photos as evidence', async () => {
      const { storage, uploads, upload } = setup();
      const photo = await phonePhoto(1000, 750);
      const key = await uploads.claim(
        USER_ID,
        'TRIP_REPORT_PHOTO',
        await upload('TRIP_REPORT_PHOTO', photo),
      );

      expect(key).toMatch(/^trip-report-photos\/[0-9a-f-]{36}\.jpg$/);
      expect(storage.get('private', key)!.body).toEqual(photo);
    });

    it('strips EXIF (GPS) from chat images, which the other party sees before confirmation', async () => {
      const { storage, uploads, upload } = setup();
      const key = await uploads.claim(
        USER_ID,
        'CHAT_IMAGE',
        await upload('CHAT_IMAGE', await phonePhoto()),
      );

      expect(key).toMatch(/^chat-images\/[0-9a-f-]{36}\.webp$/);
      const meta = await sharp(storage.get('private', key)!.body).metadata();
      expect([meta.format, meta.width, meta.exif]).toEqual(['webp', 1600, undefined]);
    });

    it.each([
      ['another user', OTHER_USER_ID, 'CAR_PHOTO'],
      ['another purpose', USER_ID, 'AVATAR'],
    ] as const)('rejects an upload claimed by %s', async (_case, userId, purpose) => {
      const { storage, uploads, upload } = setup();
      const uploadKey = await upload('CAR_PHOTO', await phonePhoto(100, 100));

      await expect(uploads.claim(userId, purpose, uploadKey)).rejects.toMatchObject({
        code: ErrorCode.UPLOAD_NOT_FOUND,
      });
      // Left in place for its owner.
      expect(storage.get('private', uploadKey)).toBeDefined();
    });

    it.each([
      'car-photos/abc',
      `uploads/${USER_ID}/car-photos/../../avatars/x`,
      `uploads/${USER_ID}/car-photos/${randomUUID()}/extra`,
    ])('rejects a key that is not a pending upload: %s', async (key) => {
      const { uploads } = setup();

      await expect(uploads.claim(USER_ID, 'CAR_PHOTO', key)).rejects.toMatchObject({
        code: ErrorCode.UPLOAD_NOT_FOUND,
      });
    });

    it('rejects an upload that was never PUT, or is claimed twice', async () => {
      const { uploads, upload } = setup();
      const ticketOnly = `uploads/${USER_ID}/car-photos/${randomUUID()}`;
      await expect(uploads.claim(USER_ID, 'CAR_PHOTO', ticketOnly)).rejects.toMatchObject({
        code: ErrorCode.UPLOAD_NOT_FOUND,
      });

      const uploadKey = await upload('CAR_PHOTO', await phonePhoto(100, 100));
      await uploads.claim(USER_ID, 'CAR_PHOTO', uploadKey);
      await expect(uploads.claim(USER_ID, 'CAR_PHOTO', uploadKey)).rejects.toMatchObject({
        code: ErrorCode.UPLOAD_NOT_FOUND,
      });
    });

    it.each([
      ['a text file', () => Promise.resolve(Buffer.from('definitely not an image'))],
      [
        'a GIF',
        () =>
          sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } })
            .gif()
            .toBuffer(),
      ],
      [
        'a truncated JPEG',
        async () => {
          const jpeg = await phonePhoto(400, 300);
          return jpeg.subarray(0, Math.floor(jpeg.length / 2));
        },
      ],
    ])('rejects %s and deletes the upload', async (_case, makeBody) => {
      const { storage, uploads, upload } = setup();
      const uploadKey = await upload('DRIVER_LICENSE', await makeBody());

      await expect(uploads.claim(USER_ID, 'DRIVER_LICENSE', uploadKey)).rejects.toMatchObject({
        code: ErrorCode.UPLOAD_INVALID_FILE,
      });
      expect(storage.keys()).toEqual([]);
    });

    it('rejects a file over the size limit and deletes it', async () => {
      const { storage, uploads, upload } = setup();
      const uploadKey = await upload('CAR_PHOTO', Buffer.alloc(UPLOAD_MAX_BYTES + 1));

      await expect(uploads.claim(USER_ID, 'CAR_PHOTO', uploadKey)).rejects.toMatchObject({
        code: ErrorCode.UPLOAD_INVALID_FILE,
      });
      expect(storage.keys()).toEqual([]);
    });
  });

  it('gives public URLs of car photo and avatar variants', () => {
    const { uploads } = setup();

    expect(uploads.carPhotoUrls('car-photos/abc')).toEqual({
      lg: 'http://cdn.test/car-photos/abc/lg.webp',
      sm: 'http://cdn.test/car-photos/abc/sm.webp',
    });
    expect(uploads.avatarUrl('avatars/abc')).toBe('http://cdn.test/avatars/abc/md.webp');
  });

  it('presigns private files', async () => {
    const { uploads } = setup();

    await expect(uploads.privateUrl('DRIVER_LICENSE', 'driver-licenses/a.jpg')).resolves.toBe(
      'http://s3.test/private/driver-licenses/a.jpg?signed',
    );
  });

  it('removes every variant of a public image, or the single private file', async () => {
    const { storage, uploads, upload } = setup();
    const photo = await uploads.claim(
      USER_ID,
      'CAR_PHOTO',
      await upload('CAR_PHOTO', await phonePhoto(100, 100)),
    );
    const license = await uploads.claim(
      USER_ID,
      'DRIVER_LICENSE',
      await upload('DRIVER_LICENSE', await phonePhoto(100, 100)),
    );

    await uploads.remove('CAR_PHOTO', photo);
    await uploads.remove('DRIVER_LICENSE', license);

    expect(storage.keys()).toEqual([]);
  });
});
