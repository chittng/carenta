import { describe, expect, it } from 'vitest';

import { loginSchema, PASSWORD_MAX_LENGTH, registerSchema } from './index.js';

describe('auth schemas', () => {
  it('trims and lowercases emails so they match case-insensitively', () => {
    expect(loginSchema.parse({ email: '  An.Nguyen@Example.COM ', password: 'x' }).email).toBe(
      'an.nguyen@example.com',
    );
  });

  it('accepts any non-empty password up to the technical cap', () => {
    const base = { email: 'a@example.com', fullName: 'An' };

    expect(registerSchema.safeParse({ ...base, password: '1' }).success).toBe(true);
    expect(
      registerSchema.safeParse({ ...base, password: 'x'.repeat(PASSWORD_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(registerSchema.safeParse({ ...base, password: '' }).error?.issues[0]?.message).toBe(
      'Vui lòng nhập mật khẩu.',
    );
    expect(
      registerSchema.safeParse({ ...base, password: 'x'.repeat(PASSWORD_MAX_LENGTH + 1) }).error
        ?.issues[0]?.message,
    ).toBe('Mật khẩu tối đa 128 ký tự.');
  });

  it('requires a full name after trimming', () => {
    const result = registerSchema.safeParse({
      email: 'a@example.com',
      password: 'x',
      fullName: '  ',
    });

    expect(result.error?.issues[0]?.message).toBe('Vui lòng nhập họ tên.');
  });

  it('reports invalid emails in Vietnamese', () => {
    expect(loginSchema.safeParse({ email: 'abc', password: 'x' }).error?.issues[0]?.message).toBe(
      'Email không hợp lệ.',
    );
  });
});
