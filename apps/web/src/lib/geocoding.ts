/**
 * Address suggestions and reverse lookups on OpenStreetMap data (spec §14): Nominatim first,
 * Photon (photon.komoot.io, same OSM data) when Nominatim cannot be reached, e.g. networks
 * that block openstreetmap.org. Called from the browser and debounced by the caller: the
 * public services allow about one request per second.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const PHOTON = 'https://photon.komoot.io';
/** minLon,minLat,maxLon,maxLat around Vietnam, like VIETNAM_BOUNDS. */
const VIETNAM_BBOX = '102,8,110,24';

export interface GeocodedPlace {
  /** One-line address to show in the suggestion list. */
  label: string;
  latitude: number;
  longitude: number;
  /** Best guesses from OSM; the owner can correct them. */
  province: string;
  ward: string;
  addressLine: string;
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  hamlet?: string;
  quarter?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  town?: string;
  city_district?: string;
  city?: string;
  county?: string;
  state?: string;
  province?: string;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

function isPlace(value: unknown): value is NominatimPlace {
  return (
    typeof value === 'object' &&
    value !== null &&
    'lat' in value &&
    'lon' in value &&
    'display_name' in value
  );
}

/**
 * Turns an OSM result into province / ward / street. Since 1/7/2025 Vietnam has two levels
 * (province, ward); OSM data may still carry districts, which are left out.
 */
export function toPlace(raw: NominatimPlace): GeocodedPlace {
  const a = raw.address ?? {};
  const province = a.state ?? a.province ?? a.city ?? '';
  const ward = a.suburb ?? a.quarter ?? a.village ?? a.town ?? a.neighbourhood ?? a.hamlet ?? '';
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  return {
    label: raw.display_name,
    latitude: Number(raw.lat),
    longitude: Number(raw.lon),
    province,
    ward,
    addressLine: street || raw.display_name.split(',')[0]?.trim() || '',
  };
}

async function nominatim(path: string, params: Record<string, string>, signal?: AbortSignal) {
  const query = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    'accept-language': 'vi',
    ...params,
  });
  const response = await fetch(`${NOMINATIM}/${path}?${query.toString()}`, { signal });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  return (await response.json()) as unknown;
}

// ─── Photon (fallback) ──────────────────────────────────────────────────────

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    state?: string;
    countrycode?: string;
  };
}

function isPhotonFeature(value: unknown): value is PhotonFeature {
  return (
    typeof value === 'object' && value !== null && 'geometry' in value && 'properties' in value
  );
}

export function fromPhoton(feature: PhotonFeature): GeocodedPlace {
  const p = feature.properties;
  const [longitude, latitude] = feature.geometry.coordinates;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  // Photon's `district` holds the ward after the 2025 merger (e.g. "Sài Gòn").
  const ward = p.district ?? p.locality ?? '';
  const province = p.state ?? p.city ?? '';
  const parts: string[] = [];
  for (const part of [p.name, street, ward, province]) {
    if (part && !parts.includes(part)) parts.push(part);
  }
  return {
    label: parts.join(', '),
    latitude,
    longitude,
    province,
    ward,
    addressLine: street || p.name || '',
  };
}

async function photon(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<GeocodedPlace[]> {
  // `default`: local (Vietnamese) names whatever the browser language.
  const query = new URLSearchParams({ lang: 'default', ...params });
  const response = await fetch(`${PHOTON}/${path}?${query.toString()}`, { signal });
  if (!response.ok) throw new Error(`Photon ${response.status}`);
  const data: unknown = await response.json();
  const features =
    typeof data === 'object' && data !== null && 'features' in data && Array.isArray(data.features)
      ? (data.features as unknown[])
      : [];
  return features
    .filter(isPhotonFeature)
    .filter((feature) => (feature.properties.countrycode ?? 'VN') === 'VN')
    .map(fromPhoton);
}

/** Nominatim, or Photon when Nominatim fails for any reason other than being cancelled. */
async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (signal?.aborted) throw error;
    return fallback();
  }
}

/** Up to five places in Vietnam matching `text`. */
export function searchAddress(text: string, signal?: AbortSignal): Promise<GeocodedPlace[]> {
  return withFallback(
    async () => {
      const data = await nominatim('search', { q: text, countrycodes: 'vn', limit: '5' }, signal);
      return Array.isArray(data) ? data.filter(isPlace).map(toPlace) : [];
    },
    () => photon('api/', { q: text, limit: '5', bbox: VIETNAM_BBOX }, signal),
    signal,
  );
}

/** The address at a point, e.g. after the owner drags the pin. */
export function reverseGeocode(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<GeocodedPlace | null> {
  const lat = String(latitude);
  const lon = String(longitude);
  return withFallback(
    async () => {
      const data = await nominatim('reverse', { lat, lon, zoom: '18' }, signal);
      return isPlace(data) ? toPlace(data) : null;
    },
    async () => (await photon('reverse', { lat, lon, limit: '1' }, signal))[0] ?? null,
    signal,
  );
}
