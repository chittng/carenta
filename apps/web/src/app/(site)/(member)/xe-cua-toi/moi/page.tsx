import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LoadingState } from '@/components/states/loading-state';

import { CarWizard } from './car-wizard';

export const metadata: Metadata = { title: 'Đăng xe cho thuê', robots: { index: false } };

export default function NewCarPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CarWizard />
    </Suspense>
  );
}
