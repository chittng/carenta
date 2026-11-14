import { z } from 'zod';

/**
 * Where the API listens, e.g. `http://localhost:4000` (no `/api/v1`). Server-side only: the
 * browser always calls this site's `/api/v1`, which next.config.ts rewrites to this origin.
 * Read by next.config.ts at build time and by server components at request time.
 */
export function apiOrigin(): string {
  const value = process.env.API_URL ?? 'http://localhost:4000';
  const parsed = z.url({ protocol: /^https?$/ }).safeParse(value);
  if (!parsed.success) throw new Error(`API_URL must be an http(s) URL, got "${value}"`);
  return parsed.data.replace(/\/+$/, '');
}
