import 'server-only';
import { type AuthUser } from '@carenta/shared';

import { ApiRequestError } from './errors';
import { serverApi } from './server';

/**
 * The signed-in user while rendering on the server, or `null` when the access cookie is
 * missing or expired. `null` does not prove the visitor is signed out: the refresh cookie
 * is only sent to `/api/v1/auth`, so render `<SessionRecovery>` to let the browser refresh
 * the session before sending them to sign in.
 */
export async function getServerSessionUser(): Promise<AuthUser | null> {
  try {
    return await serverApi.get<AuthUser>('/auth/me');
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}
