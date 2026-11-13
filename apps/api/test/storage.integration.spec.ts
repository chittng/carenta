import { randomUUID } from 'node:crypto';

import sharp from 'sharp';

import { ErrorCode } from '@carenta/shared';

import { StorageService } from '../src/storage/storage.service.js';
import { UploadsService } from '../src/storage/uploads.service.js';
import { testConfig } from './test-config.js';

/**
 * Round trip against the RustFS from compose.yaml (`docker compose up -d`).
 * CI has no RustFS, so this only runs with S3_INTEGRATION=1:
 *   S3_INTEGRATION=1 pnpm --filter @carenta/api exec vitest run test/storage.integration.spec.ts
 */
const photo = () =>
  sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#c33' } })
    .jpeg()
    .toBuffer();

describe.runIf(process.env.S3_INTEGRATION === '1')('storage against RustFS', () => {
  const { env, config } = testConfig();
  const storage = new StorageService(config);
  const uploads = new UploadsService(storage);
  const userId = randomUUID();

  afterAll(() => storage.onModuleDestroy());

  /** Does what the browser does with a ticket. */
  async function browserUpload(purpose: 'CAR_PHOTO' | 'DRIVER_LICENSE', body: Buffer) {
    const ticket = await uploads.createUpload(userId, {
      purpose,
      contentType: 'image/jpeg',
      size: body.length,
    });
    const response = await fetch(ticket.uploadUrl, {
      method: ticket.method,
      headers: { ...ticket.headers, Origin: 'http://localhost:3000' },
      body: new Uint8Array(body),
    });
    return { ticket, response };
  }

  it('uploads a car photo with the presigned URL and serves its variants publicly', async () => {
    const { ticket, response } = await browserUpload('CAR_PHOTO', await photo());
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');

    const key = await uploads.claim(userId, 'CAR_PHOTO', ticket.key);

    const urls = uploads.carPhotoUrls(key);
    const image = await fetch(urls.lg);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/webp');
    expect(image.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const meta = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 1200]);
    expect(await storage.stat('private', ticket.key)).toBeNull();

    await uploads.remove('CAR_PHOTO', key);
    expect((await fetch(urls.lg)).status).toBe(404);
  });

  it('keeps private files behind presigned URLs', async () => {
    const body = await photo();
    const { ticket } = await browserUpload('DRIVER_LICENSE', body);
    const key = await uploads.claim(userId, 'DRIVER_LICENSE', ticket.key);

    const signed = await fetch(await uploads.privateUrl('DRIVER_LICENSE', key));
    expect(signed.status).toBe(200);
    expect(Buffer.from(await signed.arrayBuffer())).toEqual(body);

    const anonymous = await fetch(`${env.S3_ENDPOINT}/${env.S3_PRIVATE_BUCKET}/${key}`);
    expect(anonymous.status).toBe(403);

    await uploads.remove('DRIVER_LICENSE', key);
    expect(await storage.stat('private', key)).toBeNull();
  });

  it('refuses an upload whose size or type differs from what was signed', async () => {
    const ticket = await uploads.createUpload(userId, {
      purpose: 'CAR_PHOTO',
      contentType: 'image/jpeg',
      size: 1000,
    });

    const biggerBody = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: ticket.headers,
      body: new Uint8Array(5000),
    });
    const otherType = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(1000),
    });

    expect(biggerBody.status).toBe(403);
    expect(otherType.status).toBe(403);
    expect(await storage.stat('private', ticket.key)).toBeNull();
  });

  it('rejects a non-image upload and removes it', async () => {
    const { ticket, response } = await browserUpload(
      'DRIVER_LICENSE',
      Buffer.from('%PDF-1.7 not an image'),
    );
    expect(response.status).toBe(200);

    await expect(uploads.claim(userId, 'DRIVER_LICENSE', ticket.key)).rejects.toMatchObject({
      code: ErrorCode.UPLOAD_INVALID_FILE,
    });
    expect(await storage.stat('private', ticket.key)).toBeNull();
  });
});
