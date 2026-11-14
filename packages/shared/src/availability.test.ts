import { describe, expect, it } from 'vitest';

import { availabilityBlockInputSchema, availabilityMonthQuerySchema } from './index.js';

const block = { startAt: '2026-11-01T08:00:00+07:00', endAt: '2026-11-01T08:30:00+07:00' };

describe('availability inputs', () => {
  it('accepts half-hour blocks in any month without rental booking restrictions', () => {
    expect(availabilityBlockInputSchema.parse({ ...block, reason: '  Bảo dưỡng  ' }).reason).toBe(
      'Bảo dưỡng',
    );
    expect(
      availabilityBlockInputSchema.safeParse({ ...block, endAt: '2028-01-01T00:00:00Z' }).success,
    ).toBe(true);
    expect(availabilityBlockInputSchema.safeParse({ ...block, reason: null }).success).toBe(true);
  });

  it.each([
    [{ startAt: 'invalid' }, 'startAt'],
    [{ endAt: '2026-11-01' }, 'endAt'],
    [{ startAt: '2026-11-01T08:15:00+07:00' }, 'startAt'],
    [{ endAt: '2026-11-01T08:30:01+07:00' }, 'endAt'],
    [{ endAt: '2026-11-01T08:30:00.001+07:00' }, 'endAt'],
    [{ endAt: block.startAt }, 'endAt'],
    [{ endAt: '2026-11-01T07:30:00+07:00' }, 'endAt'],
    [{ reason: 'x'.repeat(501) }, 'reason'],
  ])('rejects an invalid block without throwing during refinement: %j', (override, path) => {
    const result = availabilityBlockInputSchema.safeParse({ ...block, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(path);
  });

  it.each(['2026-00', '2026-13', '2026-1', '26-01', '2026-01-01', '', undefined, ['2026-01']])(
    'rejects an invalid month: %s',
    (month) => {
      expect(availabilityMonthQuerySchema.safeParse({ month }).success).toBe(false);
    },
  );

  it('accepts December and leap-year February', () => {
    expect(availabilityMonthQuerySchema.parse({ month: '2026-12' }).month).toBe('2026-12');
    expect(availabilityMonthQuerySchema.parse({ month: '2028-02' }).month).toBe('2028-02');
  });
});
