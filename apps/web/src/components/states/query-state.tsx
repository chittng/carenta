'use client';

import { type UseQueryResult } from '@tanstack/react-query';
import { type ReactNode } from 'react';

import { ErrorState } from './error-state';
import { LoadingState } from './loading-state';

/**
 * Renders the loading, error and empty states of a query, and `children(data)` otherwise,
 * so every screen gets all three (AGENTS.md § Frontend) without repeating the branching.
 *
 * ```tsx
 * <QueryState query={cars} isEmpty={(page) => page.items.length === 0} empty={<EmptyState … />}>
 *   {(page) => <CarList cars={page.items} />}
 * </QueryState>
 * ```
 */
export function QueryState<T>({
  query,
  children,
  loading,
  empty,
  isEmpty,
  errorTitle,
}: {
  query: Pick<
    UseQueryResult<T>,
    'data' | 'error' | 'isPending' | 'isError' | 'isRefetching' | 'refetch'
  >;
  children: (data: T) => ReactNode;
  /** Defaults to a spinner; pass skeletons shaped like the content where possible. */
  loading?: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  errorTitle?: string;
}) {
  // A refetch that fails after a success keeps the old data, so show the data in that case.
  if (query.isError && query.data === undefined) {
    return (
      <ErrorState
        error={query.error}
        title={errorTitle}
        retrying={query.isRefetching}
        onRetry={() => void query.refetch()}
      />
    );
  }
  // TanStack Query never resolves a query with `undefined`, so this is the loading state.
  const { data } = query;
  if (data === undefined) return loading ?? <LoadingState />;
  if (empty !== undefined && isEmpty?.(data)) return empty;
  return children(data);
}
