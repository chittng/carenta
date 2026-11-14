'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { safeNext } from '@/lib/auth-redirect';
import { useSession } from '@/lib/session';

/**
 * The page to return to after signing in or up (from `?next=`), and an effect that leaves
 * the sign-in/up page straight away for a visitor who is already signed in.
 */
export function useAuthRedirect(): string {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { data: user } = useSession();

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  return next;
}
