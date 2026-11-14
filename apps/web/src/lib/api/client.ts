import { ErrorCode } from '@carenta/shared';

import { ApiRequestError } from './errors';
import { type Query, type RequestOptions, sendRequest } from './request';

/**
 * Browser API client. Calls go to this site's own `/api/v1`, which Next proxies to the API
 * (see next.config.ts), so the httpOnly auth cookies are first-party and sent automatically.
 *
 * The access token lives 15 minutes. When a call answers 401 `UNAUTHORIZED`, the client
 * asks `/auth/refresh` for new cookies once and retries; if that fails the user has to sign
 * in again and the original 401 is thrown.
 */

const BROWSER_BASE_URL = '';
const REFRESH_PATH = '/auth/refresh';

/** Shared by concurrent 401s so one expired session triggers exactly one refresh. */
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= sendRequest(BROWSER_BASE_URL, REFRESH_PATH, { method: 'POST' })
    .then(() => true)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function isExpiredSession(error: unknown): boolean {
  // Only the guard's "not signed in" answer; INVALID_CREDENTIALS and friends are also 401
  // but refreshing would not change them.
  return (
    error instanceof ApiRequestError &&
    error.status === 401 &&
    error.code === ErrorCode.UNAUTHORIZED
  );
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await sendRequest<T>(BROWSER_BASE_URL, path, options);
  } catch (error) {
    if (path === REFRESH_PATH || !isExpiredSession(error) || !(await refreshSession())) {
      throw error;
    }
    return sendRequest<T>(BROWSER_BASE_URL, path, options);
  }
}

type Options = Omit<RequestOptions, 'method' | 'body' | 'query'>;

export const api = {
  get: <T>(path: string, query?: Query, options?: Options) =>
    apiRequest<T>(path, { ...options, query }),
  post: <T = void>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T = void>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T = void>(path: string, body?: unknown, options?: Options) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T = void>(path: string, options?: Options) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
