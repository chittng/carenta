import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Fixed values so tests do not depend on a local .env (real env vars win over .env).
    env: {
      NODE_ENV: 'test',
      WEB_URL: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://carenta:carenta@localhost:5432/carenta',
      // Same as compose.yaml; only the INTEGRATION=1 tests (test/*.integration.spec.ts) connect.
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'carenta',
      S3_SECRET_ACCESS_KEY: 'carenta-secret',
      S3_FORCE_PATH_STYLE: 'true',
      S3_PUBLIC_BUCKET: 'carenta-public',
      S3_PUBLIC_BASE_URL: 'http://localhost:9000/carenta-public',
      S3_PRIVATE_BUCKET: 'carenta-private',
      // Database 1, away from the dev server's queues in database 0.
      VALKEY_URL: 'redis://localhost:6379/1',
      // Booting the app in tests must not need Valkey; integration tests start workers themselves.
      JOBS_WORKER: 'false',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      MAIL_FROM: 'Carenta <no-reply@carenta.local>',
    },
  },
});
