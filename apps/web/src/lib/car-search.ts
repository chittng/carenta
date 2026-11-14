import {
  type CarSearchQuery,
  carSearchQuerySchema,
  SEARCH_PAGE_SIZE_DEFAULT,
  SEARCH_RADIUS_DEFAULT_KM,
  VIETNAM_BOUNDS,
} from '@carenta/shared';

import { routes } from './navigation';

export type SearchView = 'list' | 'map';
export interface SearchCenter {
  latitude: number;
  longitude: number;
}

/** Preserve repeated list parameters; never forward presentation or unknown URL fields. */
export function searchInput(params: URLSearchParams): Record<string, string | string[]> {
  const input: Record<string, string | string[]> = {};
  for (const key of Object.keys(carSearchQuerySchema.shape)) {
    const values = params.getAll(key);
    if (values.length > 0) input[key] = values.length === 1 ? values[0]! : values;
  }
  return input;
}

export function searchParams(query: Partial<CarSearchQuery>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '' || !Object.hasOwn(carSearchQuerySchema.shape, key))
      continue;
    if (key === 'page' && value === 1) continue;
    if (key === 'pageSize' && value === SEARCH_PAGE_SIZE_DEFAULT) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else {
      params.set(key, String(value));
    }
  }
  return params;
}

export function searchHref(query: Partial<CarSearchQuery>, view: SearchView = 'list'): string {
  const params = searchParams(query);
  if (view === 'map') params.set('view', 'map');
  const text = params.toString();
  return text ? `${routes.search}?${text}` : routes.search;
}

/** A map search replaces textual location constraints, preserving every other filter. */
export function searchAround(query: CarSearchQuery, center: SearchCenter): CarSearchQuery | null {
  if (
    center.latitude < VIETNAM_BOUNDS.minLatitude ||
    center.latitude > VIETNAM_BOUNDS.maxLatitude ||
    center.longitude < VIETNAM_BOUNDS.minLongitude ||
    center.longitude > VIETNAM_BOUNDS.maxLongitude
  )
    return null;
  return {
    ...query,
    province: undefined,
    ward: undefined,
    lat: center.latitude,
    lng: center.longitude,
    radiusKm: query.radiusKm ?? SEARCH_RADIUS_DEFAULT_KM,
    page: 1,
  };
}
