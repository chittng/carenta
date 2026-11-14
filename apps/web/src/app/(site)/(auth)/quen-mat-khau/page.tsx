import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoadingState } from '@/components/states/loading-state';

import { ForgotPassword } from './forgot-password';

// A reset link carries a single-use token: keep it out of the Referer header and search indexes.
export const metadata: Metadata = {
  title: 'Quên mật khẩu',
  referrer: 'no-referrer',
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ForgotPassword />
    </Suspense>
  );
}
