import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { carSearchQuerySchema } from '@carenta/shared';

import { searchAround, searchHref, searchInput, searchParams } from './car-search';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T03:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('shareable car searches', () => {
  it('round-trips all API filters, repeated selections and explicit false values', () => {
    const input = new URLSearchParams(
      'province=Hồ Chí Minh&ward=Sài Gòn&startAt=2026-11-15T02:00:00Z&endAt=2026-11-16T02:00:00Z&minPrice=0&maxPrice=1500000&makeIds=1&makeIds=2&bodyTypes=SUV&transmissions=AUTOMATIC&fuelTypes=GASOLINE&seatsMin=4&seatsMax=7&instantBook=false&delivery=true&amenityIds=3,4&sort=price_asc&page=3&pageSize=10',
    );
    const query = carSearchQuerySchema.parse(searchInput(input));
    const sharedUrl = searchHref(query, 'map');
    const sharedParams = new URL(sharedUrl, 'https://carenta.example').searchParams;
    expect(sharedParams.get('view')).toBe('map');
    expect(sharedParams.getAll('makeIds')).toEqual(['1', '2']);
    expect(sharedParams.get('instantBook')).toBe('false');
    expect(sharedParams.get('minPrice')).toBe('0');
    expect(carSearchQuerySchema.parse(searchInput(sharedParams))).toEqual(query);
  });

  it('keeps view and unknown fields out of API parameters and keeps links local', () => {
    const input = searchInput(
      new URLSearchParams('province=javascript:alert(1)&view=map&status=CONFIRMED&ownerId=secret'),
    );
    expect(Object.keys(input)).toEqual(['province']);
    expect(searchHref(carSearchQuerySchema.parse(input))).toMatch(/^\/tim-xe\?province=/);
    expect(searchParams(carSearchQuerySchema.parse({})).toString()).toBe('');
  });

  it('rejects malformed shared searches instead of querying a different set of cars', () => {
    for (const text of [
      'lat=10',
      'sort=distance',
      'page=0',
      'maxPrice=100&minPrice=200',
      'startAt=2026-11-15T02:00:00Z',
      'fuelTypes=unknown',
    ]) {
      expect(carSearchQuerySchema.safeParse(searchInput(new URLSearchParams(text))).success).toBe(
        false,
      );
    }
  });

  it('preserves filters and times when searching a new map center, but resets textual location and page', () => {
    const query = carSearchQuerySchema.parse({
      province: 'Hà Nội',
      ward: 'Ba Đình',
      startAt: '2026-11-15T02:00:00Z',
      endAt: '2026-11-16T02:00:00Z',
      instantBook: 'false',
      makeIds: ['2'],
      sort: 'rating',
      page: 4,
    });
    const moved = searchAround(query, { latitude: 10.78, longitude: 106.7 });
    expect(moved).toMatchObject({
      lat: 10.78,
      lng: 106.7,
      radiusKm: 10,
      page: 1,
      instantBook: false,
      makeIds: [2],
      sort: 'rating',
      startAt: query.startAt,
      endAt: query.endAt,
    });
    expect(moved?.province).toBeUndefined();
    expect(moved?.ward).toBeUndefined();
    expect(carSearchQuerySchema.parse(searchInput(searchParams(moved ?? {})))).toEqual(moved);
  });

  it('preserves the selected radius and does not search outside Vietnam', () => {
    const query = carSearchQuerySchema.parse({ lat: 21, lng: 105, radiusKm: 50 });
    expect(searchAround(query, { latitude: 10, longitude: 106 })?.radiusKm).toBe(50);
    expect(searchAround(query, { latitude: 0, longitude: 0 })).toBeNull();
  });
});
