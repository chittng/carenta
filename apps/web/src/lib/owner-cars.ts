'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { type Amenity, type CarMake, type OwnerCar } from '@carenta/shared';

import { api } from './api/client';

export const ownerCarKey = (id: string) => ['owner', 'cars', id] as const;
export const OWNER_CARS_KEY = ['owner', 'cars'] as const;

/** Makes, models and amenities change rarely (Console only). */
const CATALOG_STALE_MS = 60 * 60_000;

export function useCarMakes() {
  return useQuery({
    queryKey: ['catalog', 'car-makes'],
    queryFn: () => api.get<CarMake[]>('/car-makes'),
    staleTime: CATALOG_STALE_MS,
  });
}

export function useAmenities() {
  return useQuery({
    queryKey: ['catalog', 'amenities'],
    queryFn: () => api.get<Amenity[]>('/amenities'),
    staleTime: CATALOG_STALE_MS,
  });
}

/** Document links are presigned for 5 minutes; refresh before they expire. */
const DOCUMENT_URL_REFRESH_MS = 4 * 60_000;

export function useOwnerCar(id: string | null) {
  return useQuery({
    queryKey: ownerCarKey(id ?? ''),
    queryFn: () => api.get<OwnerCar>(`/owner/cars/${id}`),
    enabled: id !== null,
    staleTime: DOCUMENT_URL_REFRESH_MS,
    refetchInterval: DOCUMENT_URL_REFRESH_MS,
  });
}

/** Every owner-car endpoint answers with the whole car: store it as the latest copy. */
export function useSetOwnerCar() {
  const queryClient = useQueryClient();
  return (car: OwnerCar) => {
    queryClient.setQueryData(ownerCarKey(car.id), car);
    void queryClient.invalidateQueries({ queryKey: OWNER_CARS_KEY, exact: true });
  };
}
