import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoadingState } from '@/components/states/loading-state';

import { AccountPage } from './account-page';

export const metadata: Metadata = { title: 'Tài khoản', robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AccountPage />
    </Suspense>
  );
}
