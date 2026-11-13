import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

/** Optional string where `VAR=` (empty, as in .env.example) means unset. */
const emptyAsUndefined = z
  .string()
  .optional()
  .transform((value) => value || undefined);

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
  /**
   * Proxies in front of the API (load balancer, Railway's router) whose X-Forwarded-For
   * is trusted for the client IP used by rate limits. 0 when clients connect directly.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  // Authentication
  /** Signs access tokens (HS256). At least 32 random characters; rotating it signs everyone out. */
  JWT_SECRET: z.string().min(32, { error: 'JWT_SECRET cần ít nhất 32 ký tự' }),
  /**
   * Cookie domain, e.g. `.carenta.vn` when the web app and API are on sibling subdomains.
   * Unset: cookies belong to the API host only.
   */
  COOKIE_DOMAIN: emptyAsUndefined,

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

  /** Valkey (Redis protocol) for BullMQ: `redis://[user:password@]host:port[/db]`, `rediss://` for TLS. */
  VALKEY_URL: z.url({ protocol: /^rediss?$/ }),
  /**
   * Whether this process runs the background workers (email, scheduled jobs). Off in
   * tests; could also be turned off on API replicas if workers move to their own process.
   */
  JOBS_WORKER: z.stringbool().default(true),

  // SMTP: Mailpit locally, Resend when deployed.
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
  /** TLS from the first byte (port 465). Otherwise STARTTLS is used when the server offers it. */
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: emptyAsUndefined,
  SMTP_PASSWORD: emptyAsUndefined,
  /** Sender shown to users, e.g. `Carenta <no-reply@carenta.vn>`. */
  MAIL_FROM: z.string().regex(/@/, { error: 'Thiếu địa chỉ email người gửi' }),
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
