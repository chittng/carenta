import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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

export function toastError(error: unknown) {
  toast.error(errorMessage(error));
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        // A first load that fails shows the screen's own error state instead (every screen
        // has one). A failed refetch would otherwise go unnoticed behind the old data.
        if (query.state.data !== undefined && query.meta?.errorToast !== false) toastError(error);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
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
}
