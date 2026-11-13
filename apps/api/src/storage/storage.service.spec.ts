import { testConfig } from '../../test/test-config.js';
import { StorageService, UPLOAD_URL_TTL_SECONDS } from './storage.service.js';

function createService(overrides: Record<string, string> = {}) {
  return new StorageService(testConfig(overrides).config);
}

describe('StorageService', () => {
  describe('presignUpload', () => {
    it('signs a PUT to the private bucket that pins content type and exact length', async () => {
      const storage = createService();

      const upload = await storage.presignUpload({
        key: 'uploads/u/car-photos/abc',
        contentType: 'image/jpeg',
        contentLength: 12_345,
      });
      const url = new URL(upload.url);

      expect(url.origin + url.pathname).toBe(
        'http://localhost:9000/carenta-private/uploads/u/car-photos/abc',
      );
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
      expect(url.searchParams.get('X-Amz-Expires')).toBe(String(UPLOAD_URL_TTL_SECONDS));
      expect(upload.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    });

    it('adds no SDK checksum parameters, which browsers cannot satisfy and R2 rejects', async () => {
      const storage = createService();

      const { url } = await storage.presignUpload({
        key: 'uploads/u/avatars/abc',
        contentType: 'image/png',
        contentLength: 1,
      });

      expect(url).not.toMatch(/checksum/i);
    });

    it('uses virtual-hosted URLs when path style is off (R2)', async () => {
      const storage = createService({
        S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        S3_FORCE_PATH_STYLE: 'false',
      });

      const { url } = await storage.presignUpload({
        key: 'uploads/u/avatars/abc',
        contentType: 'image/png',
        contentLength: 1,
      });

      expect(new URL(url).host).toBe('carenta-private.account.r2.cloudflarestorage.com');
    });
  });

  it('presigns a short-lived GET for a private file', async () => {
    const url = new URL(await createService().presignDownload('driver-licenses/a.jpg'));

    expect(url.pathname).toBe('/carenta-private/driver-licenses/a.jpg');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('builds public URLs from the configured base URL, encoding each segment', () => {
    const storage = createService({ S3_PUBLIC_BASE_URL: 'https://img.carenta.vn/' });

    expect(storage.publicUrl('car-photos/a b/lg.webp')).toBe(
      'https://img.carenta.vn/car-photos/a%20b/lg.webp',
    );
  });
});
