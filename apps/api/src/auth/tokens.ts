import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random token for links and refresh cookies, URL-safe. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Tokens are stored as SHA-256 hashes: they are already high-entropy random values, so a
 * fast hash is enough and lets the database look them up directly.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
