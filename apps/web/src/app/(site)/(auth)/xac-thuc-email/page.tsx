import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoadingState } from '@/components/states/loading-state';

import { VerifyEmail } from './verify-email';

// The URL carries a single-use token: keep it out of the Referer header and search indexes.
export const metadata: Metadata = {
  title: 'Xác thực email',
  referrer: 'no-referrer',
  robots: { index: false },
};

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <VerifyEmail />
    </Suspense>
  );
}
