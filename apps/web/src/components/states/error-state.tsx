'use client';

import { RefreshCwIcon, TriangleAlertIcon, WifiOffIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ApiRequestError, ClientErrorCode, errorMessage } from '@/lib/api/errors';

import { EmptyState } from './empty-state';

/**
 * Something failed to load. Shows the API's Vietnamese message (never a raw exception) and,
 * when given `onRetry`, a retry button.
 */
export function ErrorState({
  error,
  title = 'Không tải được dữ liệu',
  onRetry,
  retrying = false,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const offline = error instanceof ApiRequestError && error.code === ClientErrorCode.NETWORK_ERROR;
  return (
    <EmptyState
      icon={offline ? WifiOffIcon : TriangleAlertIcon}
      title={title}
      description={errorMessage(error)}
      className={className}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry} disabled={retrying}>
            <RefreshCwIcon className={retrying ? 'animate-spin' : undefined} aria-hidden />
            Thử lại
          </Button>
        )
      }
    />
  );
}
