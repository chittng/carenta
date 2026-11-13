import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

/**
 * Environment variables the API reads. Feature modules add their variables here
 * (and to `.env.example`) when they start using them, so a missing value fails at boot.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  /** Web origin: the only origin allowed by CORS, also used for links in emails. */
  WEB_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, '')),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type Env = z.infer<typeof envSchema>;

/** Typed `ConfigService`: `config.get('PORT', { infer: true })` returns a number. */
export class AppConfigService extends ConfigService<Env, true> {}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
