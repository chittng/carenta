import { type AppConfigService, validateEnv } from '../src/config/env.js';

/**
 * Config for services built by hand in tests: the vitest env (see vitest.config.ts)
 * plus `overrides`, validated the same way the app does at boot.
 */
export function testConfig(overrides: Record<string, string> = {}) {
  const env = validateEnv({ ...process.env, ...overrides });
  const config = { get: (key: keyof typeof env) => env[key] };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- services only call `get`
  return { env, config: config as unknown as AppConfigService };
}
