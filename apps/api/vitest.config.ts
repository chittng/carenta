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
    },
  },
});
