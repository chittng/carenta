'use client';

import { useQuery } from '@tanstack/react-query';

import { type MyDriverLicenses, type MyProfile } from '@carenta/shared';

import { api } from './api/client';

export const PROFILE_QUERY_KEY = ['me', 'profile'] as const;
export const DRIVER_LICENSES_QUERY_KEY = ['me', 'driver-license'] as const;

export function useMyProfile() {
  return useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => api.get<MyProfile>('/me/profile'),
  });
}

/** License photo links are presigned for 5 minutes; refresh before they expire. */
const LICENSE_URL_REFRESH_MS = 4 * 60_000;

export function useMyDriverLicenses() {
  return useQuery({
    queryKey: DRIVER_LICENSES_QUERY_KEY,
    queryFn: () => api.get<MyDriverLicenses>('/me/driver-license'),
    staleTime: LICENSE_URL_REFRESH_MS,
    refetchInterval: LICENSE_URL_REFRESH_MS,
  });
}
