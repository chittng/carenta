import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ErrorCode } from '@carenta/shared';

import { api } from './api/client';
import { ApiRequestError, errorMessage } from './api/errors';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      /** Toast when a background refetch fails (default true). */
      errorToast?: boolean;
    };
    mutationMeta: {
      /**
       * Toast the error message (default true). Forms that put the API's `details` on their
       * fields pass `false` and show the rest themselves.
       */
      errorToast?: boolean;
    };
  }
}

const MAX_RETRIES = 2;

function shouldRetry(failureCount: number, error: Error): boolean {
  // 4xx answers will not change on retry; network errors and 5xx might.
  if (error instanceof ApiRequestError && error.isClientError) return false;
  return failureCount < MAX_RETRIES;
}

async function resendFromToast() {
  try {
    await api.post('/auth/resend-verification');
    toast.success('Đã gửi lại email xác thực. Link có hiệu lực 24 giờ.');
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

export function toastError(error: unknown) {
  // Actions that need a verified email (spec §3) always come with a way to get the link again.
  if (error instanceof ApiRequestError && error.code === ErrorCode.EMAIL_NOT_VERIFIED) {
    toast.error(error.message, {
      action: {
        label: 'Gửi lại email',
        onClick: () => void resendFromToast(),
      },
    });
    return;
  }
  toast.error(errorMessage(error));
}

/** Query key of the signed-in user (see `useSession`); `null` data means signed out. */
export const SESSION_QUERY_KEY = ['auth', 'me'] as const;

function isSignedOut(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === ErrorCode.UNAUTHORIZED;
}

export function makeQueryClient(): QueryClient {
  // A 401 that survived the client's refresh means the session is gone (expired, signed out
  // in another tab, or revoked by an admin): show the header and menus as signed out.
  const onSignedOut = (error: unknown) => {
    if (isSignedOut(error)) client.setQueryData(SESSION_QUERY_KEY, null);
  };

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        onSignedOut(error);
        // A first load that fails shows the screen's own error state instead (every screen
        // has one). A failed refetch would otherwise go unnoticed behind the old data.
        if (query.state.data !== undefined && query.meta?.errorToast !== false) toastError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        onSignedOut(error);
        if (mutation.meta?.errorToast !== false) toastError(error);
      },
    }),
    defaultOptions: {
      queries: {
        // Data rendered on the server should not be refetched right after hydration.
        staleTime: 30_000,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return client;
}
