import { describe, expect, it } from 'vitest';

import { carSearchQuerySchema, tripWindowIssue } from './index.js';

const HOUR = 60 * 60 * 1000;
/** A fixed "now" on a 30-minute step: 2026-11-14 10:00 in Vietnam. */
const NOW = new Date('2026-11-14T03:00:00Z');
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * HOUR);

describe('tripWindowIssue', () => {
  it('accepts a trip 2 hours to 90 days ahead on 30-minute steps', () => {
    expect(tripWindowIssue(at(2), at(26), NOW)).toBeNull();
    expect(tripWindowIssue(at(90 * 24), at(91 * 24), NOW)).toBeNull();
    expect(tripWindowIssue(at(2.5), at(3), NOW)).toBeNull();
  });

  it.each([
    ['pickup off the 30-minute step', at(2.25), at(26), 'startAt', 'bước 30 phút'],
    ['return off the 30-minute step', at(2), at(26.25), 'endAt', 'bước 30 phút'],
    ['return before pickup', at(26), at(2), 'endAt', 'sau giờ nhận xe'],
    ['return equal to pickup', at(4), at(4), 'endAt', 'sau giờ nhận xe'],
    ['pickup under 2 hours away', at(1.5), at(26), 'startAt', 'ít nhất 2 giờ'],
    ['pickup in the past', at(-24), at(26), 'startAt', 'ít nhất 2 giờ'],
    ['pickup over 90 days away', at(90 * 24 + 0.5), at(91 * 24), 'startAt', '90 ngày'],
    ['a trip over 180 days', at(2), at(2 + 180 * 24 + 0.5), 'endAt', '180 ngày'],
  ])('refuses %s', (_name, startAt, endAt, path, message) => {
    const issue = tripWindowIssue(startAt, endAt, NOW);
    expect(issue?.path).toBe(path);
    expect(issue?.message).toContain(message);
  });
});

/** Parses like the query string does: every value arrives as a string or string array. */
const parse = (query: Record<string, string | string[]>) => carSearchQuerySchema.safeParse(query);
const issuesOf = (query: Record<string, string | string[]>) =>
  parse(query).error?.issues.map((issue) => issue.path.join('.'));

/** Pickup tomorrow at 10:00 Vietnam time, return the day after: always valid. */
function tomorrow() {
  const start = new Date();
  start.setUTCHours(start.getUTCHours() + 26, 0, 0, 0);
  return {
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 24 * HOUR).toISOString(),
  };
}

describe('carSearchQuerySchema', () => {
  it('needs nothing and pages by 20 by default', () => {
    expect(parse({}).data).toEqual({ page: 1, pageSize: 20 });
  });

  it('reads numbers, booleans and trims places', () => {
    const result = parse({
      province: '  Hồ Chí Minh ',
      ward: '   ',
      lat: '10.77',
      lng: '106.7',
      radiusKm: '5',
      minPrice: '500000',
      maxPrice: '1000000',
      seatsMin: '4',
      seatsMax: '7',
      instantBook: 'true',
      delivery: 'false',
      sort: 'price_asc',
      page: '2',
      pageSize: '50',
    });
    expect(result.data).toEqual({
      province: 'Hồ Chí Minh',
      ward: undefined,
      lat: 10.77,
      lng: 106.7,
      radiusKm: 5,
      minPrice: 500_000,
      maxPrice: 1_000_000,
      seatsMin: 4,
      seatsMax: 7,
      instantBook: true,
      delivery: false,
      sort: 'price_asc',
      page: 2,
      pageSize: 50,
    });
  });

  it('normalises place names to NFC so decomposed accents still match', () => {
    const decomposed = 'Hồ Chí Minh'.normalize('NFD');
    expect(parse({ province: decomposed }).data?.province).toBe('Hồ Chí Minh'.normalize('NFC'));
  });

  it('reads lists repeated or comma-separated, without duplicates', () => {
    const result = parse({
      makeIds: ['3', '5,3'],
      fuelTypes: 'DIESEL, HYBRID,',
      amenityIds: '7',
      bodyTypes: ['SUV'],
    });
    expect(result.data).toMatchObject({
      makeIds: [3, 5],
      fuelTypes: ['DIESEL', 'HYBRID'],
      amenityIds: [7],
      bodyTypes: ['SUV'],
    });
  });

  it.each([
    [{ fuelTypes: 'COAL' }, 'fuelTypes.0'],
    [{ makeIds: 'abc' }, 'makeIds.0'],
    [{ transmissions: 'manual' }, 'transmissions.0'],
    [{ pageSize: '51' }, 'pageSize'],
    [{ seatsMin: '1' }, 'seatsMin'],
    [{ sort: 'cheapest' }, 'sort'],
    [{ instantBook: 'maybe' }, 'instantBook'],
  ])('refuses %j', (query, path) => {
    expect(issuesOf(query)).toEqual([path]);
  });

  it('needs both coordinates, inside Vietnam', () => {
    expect(issuesOf({ lat: '10.7' })).toEqual(['lng']);
    expect(issuesOf({ lng: '106.7' })).toEqual(['lat']);
    expect(issuesOf({ lat: '35.6', lng: '139.7' })).toEqual(['lat', 'lng']);
  });

  it('only takes a radius or the distance sort around a point', () => {
    expect(issuesOf({ radiusKm: '5' })).toEqual(['radiusKm']);
    expect(issuesOf({ sort: 'distance' })).toEqual(['sort']);
    expect(issuesOf({ lat: '10.7', lng: '106.7', radiusKm: '51' })).toEqual(['radiusKm']);
    expect(parse({ lat: '10.7', lng: '106.7', sort: 'distance' }).success).toBe(true);
  });

  it('needs both times, checked like a booking', () => {
    const { startAt, endAt } = tomorrow();
    expect(parse({ startAt, endAt }).success).toBe(true);
    expect(issuesOf({ startAt })).toEqual(['endAt']);
    expect(issuesOf({ endAt })).toEqual(['startAt']);
    expect(issuesOf({ startAt: endAt, endAt: startAt })).toEqual(['endAt']);
    expect(issuesOf({ startAt: 'tomorrow', endAt, minPrice: '9', maxPrice: '1' })).toEqual([
      'startAt',
      'maxPrice',
    ]);
    const soon = new Date(Date.now() + HOUR).toISOString();
    expect(issuesOf({ startAt: soon, endAt })).toEqual(['startAt']);
  });

  it('refuses ranges that are upside down', () => {
    expect(issuesOf({ minPrice: '900000', maxPrice: '500000' })).toEqual(['maxPrice']);
    expect(issuesOf({ seatsMin: '7', seatsMax: '4' })).toEqual(['seatsMax']);
  });
});
