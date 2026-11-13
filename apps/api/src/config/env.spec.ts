import { validateEnv } from './env.js';

const VALID_ENV = {
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://carenta:carenta@localhost:5432/carenta',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY_ID: 'carenta',
  S3_SECRET_ACCESS_KEY: 'carenta-secret',
  S3_PUBLIC_BUCKET: 'carenta-public',
  S3_PUBLIC_BASE_URL: 'http://localhost:9000/carenta-public',
  S3_PRIVATE_BUCKET: 'carenta-private',
};

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    expect(validateEnv(VALID_ENV)).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      S3_REGION: 'auto',
      S3_FORCE_PATH_STYLE: false,
      ...VALID_ENV,
    });
  });

  it('parses S3_FORCE_PATH_STYLE and trims a trailing slash from S3_PUBLIC_BASE_URL', () => {
    const env = validateEnv({
      ...VALID_ENV,
      S3_FORCE_PATH_STYLE: 'true',
      S3_PUBLIC_BASE_URL: 'https://img.carenta.vn/',
    });

    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.S3_PUBLIC_BASE_URL).toBe('https://img.carenta.vn');
  });

  it('coerces PORT from a string and trims a trailing slash from WEB_URL', () => {
    const env = validateEnv({ ...VALID_ENV, PORT: '8080', WEB_URL: 'https://carenta.vn/' });

    expect(env.PORT).toBe(8080);
    expect(env.WEB_URL).toBe('https://carenta.vn');
  });

  it('ignores variables it does not know about', () => {
    expect(validateEnv({ ...VALID_ENV, PATH: '/usr/bin' })).not.toHaveProperty('PATH');
  });

  it('fails listing every missing variable', () => {
    expect(() => validateEnv({})).toThrow(/WEB_URL[\s\S]*DATABASE_URL|DATABASE_URL[\s\S]*WEB_URL/);
  });

  it.each([
    ['DATABASE_URL', 'mysql://localhost/carenta'],
    ['WEB_URL', 'localhost:3000'],
    ['PORT', '70000'],
    ['NODE_ENV', 'staging'],
    ['S3_ENDPOINT', 's3.amazonaws.com'],
    ['S3_FORCE_PATH_STYLE', 'maybe'],
    ['S3_PRIVATE_BUCKET', ''],
  ])('rejects an invalid %s', (key, value) => {
    expect(() => validateEnv({ ...VALID_ENV, [key]: value })).toThrow(key);
  });
});
