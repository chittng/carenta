'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';

/** Leaflet touches `window` on import, so the map only loads in the browser. */
export const PinMapLazy = dynamic(() => import('./pin-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-lg" />,
});
