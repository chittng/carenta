import { AMENITIES, CAR_MAKES, HOLIDAY_BREAKS } from '../prisma/seed-data/catalog.js';
import { expandDateRange, slugify } from '../prisma/seed-data/utils.js';

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugify('Mercedes-Benz')).toBe('mercedes-benz');
    expect(slugify('VF e34')).toBe('vf-e34');
    expect(slugify('Lux SA2.0')).toBe('lux-sa2-0');
  });

  it('removes Vietnamese diacritics', () => {
    expect(slugify('Đà Nẵng')).toBe('da-nang');
  });
});

describe('expandDateRange', () => {
  it('includes both ends', () => {
    const days = expandDateRange('2026-04-30', '2026-05-03').map((d) => d.toISOString());
    expect(days).toEqual([
      '2026-04-30T00:00:00.000Z',
      '2026-05-01T00:00:00.000Z',
      '2026-05-02T00:00:00.000Z',
      '2026-05-03T00:00:00.000Z',
    ]);
  });

  it('rejects reversed ranges and invalid dates', () => {
    expect(() => expandDateRange('2026-05-03', '2026-04-30')).toThrow('Invalid date range');
    expect(() => expandDateRange('2026-02-30', '2026-03-01')).toThrow('Invalid date "2026-02-30"');
    expect(() => expandDateRange('2026-2-1', '2026-03-01')).toThrow('Expected YYYY-MM-DD');
  });
});

describe('seed catalogue', () => {
  it('has unique make slugs and unique model slugs per make', () => {
    const makeSlugs = CAR_MAKES.map((make) => slugify(make.name));
    expect(new Set(makeSlugs).size).toBe(makeSlugs.length);
    const duplicates = CAR_MAKES.flatMap((make) => {
      const modelSlugs = make.models.map(slugify);
      return modelSlugs.filter((slug, index) => modelSlugs.indexOf(slug) !== index);
    });
    expect(duplicates).toEqual([]);
  });

  it('has unique amenity codes', () => {
    const codes = AMENITIES.map((amenity) => amenity.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has no overlapping holiday breaks', () => {
    const days = HOLIDAY_BREAKS.flatMap(({ from, to }) =>
      expandDateRange(from, to).map((d) => d.toISOString()),
    );
    expect(new Set(days).size).toBe(days.length);
  });
});
