import { type ReactNode, Suspense } from 'react';

import { SignedInOnly } from '@/components/auth/signed-in-only';
import { LoadingState } from '@/components/states/loading-state';

/**
 * Pages that need an account (spec §13): my trips, my cars, owner bookings, wallet,
 * messages, account, booking. Put them in this route group to require sign-in.
 */
export default function MemberLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <SignedInOnly>{children}</SignedInOnly>
    </Suspense>
  );
}
