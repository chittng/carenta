import 'server-only';
import { cookies } from 'next/headers';

import { apiOrigin } from '@/config/api-origin';

import { type Query, type RequestOptions, sendRequest } from './request';

/**
 * Read-only API client for Server Components. It calls the API directly (server to server)
 * and forwards the visitor's cookies. Changes go through the browser client, so the auth
 * cookies the API sets reach the browser.
 *
 * It cannot refresh an expired session: refreshing sets cookies, which a Server Component
 * render is not allowed to do. A 401 here means "treat as signed out"; the browser client
 * refreshes on its next call.
 */

type ServerOptions = Omit<RequestOptions, 'method' | 'body' | 'query'> & {
  /**
   * Send the visitor's cookies (default). Pass `false` for public data so the call does
   * not read request cookies and its result can be cached.
   */
  auth?: boolean;
};

async function serverRequest<T>(path: string, options: RequestOptions & ServerOptions) {
  const { auth = true, ...rest } = options;
  const headers = new Headers(rest.headers);
  if (auth) {
    const cookieHeader = (await cookies()).toString();
    if (cookieHeader) headers.set('Cookie', cookieHeader);
  }
  return sendRequest<T>(apiOrigin(), path, {
    ...rest,
    headers,
    init: { cache: 'no-store', ...rest.init },
  });
}

export const serverApi = {
  get: <T>(path: string, query?: Query, options?: ServerOptions) =>
    serverRequest<T>(path, { ...options, query }),
};
