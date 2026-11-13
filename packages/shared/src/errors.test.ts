import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { apiErrorSchema } from './index.js';

describe('zod locale', () => {
  it('reports validation errors in Vietnamese once the package is imported', () => {
    const result = z.object({ email: z.email() }).safeParse({ email: 'not-an-email' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('địa chỉ email không hợp lệ');
  });
});

describe('apiErrorSchema', () => {
  it('accepts an error with field details', () => {
    const body = {
      code: 'VALIDATION_FAILED',
      message: 'Dữ liệu không hợp lệ.',
      details: [{ path: 'email', message: 'địa chỉ email không hợp lệ' }],
    };

    expect(apiErrorSchema.parse(body)).toEqual(body);
  });

  it('rejects a body without a code', () => {
    expect(apiErrorSchema.safeParse({ message: 'Lỗi' }).success).toBe(false);
  });
});
