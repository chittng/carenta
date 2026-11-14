'use client';

import { useEffect } from 'react';

import { ErrorState } from './error-state';

/**
 * Body of the `error.tsx` boundaries. Errors thrown while rendering on the server reach the
 * browser without their message (Next hides it in production), so this shows a generic
 * Vietnamese message; client errors from the API keep theirs.
 */
export function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState title="Đã có lỗi xảy ra" error={error} onRetry={retry} className="flex-1 py-16" />
  );
}
