import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoadingState } from '@/components/states/loading-state';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default function LoginPage() {
  return (
    // The form reads `?next=` from the URL, which is only known per request.
    <Suspense fallback={<LoadingState />}>
      <LoginForm />
    </Suspense>
  );
}
