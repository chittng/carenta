'use client';

import { hashKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { type AuthUser } from '@carenta/shared';

import { api } from './api/client';
import { ApiRequestError } from './api/errors';
import { SESSION_QUERY_KEY } from './query-client';

/** Where to send a visitor who must sign in; CARENTA-16 brings them back to `next`. */
export function signInHref(next?: string): string {
  return next ? `/dang-nhap?next=${encodeURIComponent(next)}` : '/dang-nhap';
}

export async function fetchSessionUser(): Promise<AuthUser | null> {
  try {
    // The client refreshes an expired access token before giving up.
    return await api.get<AuthUser>('/auth/me');
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

/** The signed-in user for client components. `data` is `undefined` while loading. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSessionUser,
    staleTime: 5 * 60_000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      // Drop everything fetched as this user. The session query stays (set to signed out)
      // because mounted headers observe it; clear() would orphan them.
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryHash !== hashKey(SESSION_QUERY_KEY),
      });
      router.push('/');
      router.refresh();
    },
  });
}
