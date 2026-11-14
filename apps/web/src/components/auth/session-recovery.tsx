'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LoadingState } from '@/components/states/loading-state';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api/errors';
import { SESSION_QUERY_KEY } from '@/lib/query-client';
import { fetchSessionUser, signInHref } from '@/lib/session';

/**
 * Rendered by a server component that found no valid access cookie. The browser client can
 * still refresh the session; if it does, the page re-renders on the server with the new
 * cookie, otherwise the visitor is sent to sign in and brought back here afterwards.
 */
export function SessionRecovery() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const recover = async () => {
      try {
        const user = await fetchSessionUser();
        if (cancelled) return;
        queryClient.setQueryData(SESSION_QUERY_KEY, user);
        if (user) router.refresh();
        else router.replace(signInHref(pathname));
      } catch (error) {
        if (!cancelled) setFailure(errorMessage(error));
      }
    };
    void recover();
    return () => {
      cancelled = true;
    };
  }, [pathname, queryClient, router]);

  if (failure) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">{failure}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Thử lại
        </Button>
      </div>
    );
  }
  return <LoadingState label="Đang kiểm tra phiên đăng nhập…" />;
}
