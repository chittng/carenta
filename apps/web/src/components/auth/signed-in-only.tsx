import { type ReactNode } from 'react';

import { getServerSessionUser } from '@/lib/api/server-session';

import { SessionRecovery } from './session-recovery';

/**
 * Renders `children` only for a signed-in visitor. Without a valid access cookie the
 * browser gets one refresh attempt, then the sign-in page with `?next=` back here.
 * Must sit inside Suspense (it reads cookies). The API still checks every request.
 */
export async function SignedInOnly({ children }: { children: ReactNode }) {
  const user = await getServerSessionUser();
  if (!user) return <SessionRecovery />;
  return children;
}
