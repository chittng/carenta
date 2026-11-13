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

  // S3-compatible storage: RustFS locally, Cloudflare R2 when deployed.
  /** Must be reachable from the browser too: presigned upload/download URLs point at it. */
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  /** R2 uses `auto`. */
  S3_REGION: z.string().min(1).default('auto'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** `true` for RustFS (`endpoint/bucket/key`); R2 works either way. */
  S3_FORCE_PATH_STYLE: z.stringbool().default(false),
  /** Car photos and avatars, anonymously readable. */
  S3_PUBLIC_BUCKET: z.string().min(1),
  /** Base URL that serves the public bucket, e.g. an R2 custom domain. */
  S3_PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, '')),
  /** Driver licenses, car documents, trip report photos, dispute evidence, chat images. */
  S3_PRIVATE_BUCKET: z.string().min(1),
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
