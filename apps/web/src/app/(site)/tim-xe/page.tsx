import { Suspense } from 'react';

import { LoadingState } from '@/components/states/loading-state';

import { CarSearch } from './car-search';

export const metadata = {
  title: 'Tìm xe tự lái',
  description: 'Tìm xe tự lái theo địa điểm, thời gian, giá và tiện nghi trên Carenta.',
};

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingState label="Đang tải trang tìm xe…" />}>
      <CarSearch />
    </Suspense>
  );
}
