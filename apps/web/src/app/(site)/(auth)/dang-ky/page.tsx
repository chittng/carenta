import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoadingState } from '@/components/states/loading-state';

import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Đăng ký' };

export default function RegisterPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RegisterForm />
    </Suspense>
  );
}
