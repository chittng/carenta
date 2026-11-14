import { describe, expect, it } from 'vitest';

import { safeNext, withNext } from './auth-redirect';

describe('safeNext', () => {
  it('keeps paths on this site, with their query', () => {
    expect(safeNext('/console')).toBe('/console');
    expect(safeNext('/xe/123?tu=2026-11-20')).toBe('/xe/123?tu=2026-11-20');
  });

  it('falls back home for missing or foreign destinations', () => {
    for (const value of [
      null,
      undefined,
      '',
      'console',
      'https://evil.example',
      '//evil.example/x',
      '/\\evil.example',
      '/\tevil',
      'javascript:alert(1)',
    ]) {
      expect(safeNext(value)).toBe('/');
    }
  });

  it('does not send the visitor back to an auth page', () => {
    expect(safeNext('/dang-nhap')).toBe('/');
    expect(safeNext('/dang-ky?next=/vi')).toBe('/');
    expect(safeNext('/xac-thuc-email?token=abc')).toBe('/');
  });
});

describe('withNext', () => {
  it('carries a real destination and drops home', () => {
    expect(withNext('/dang-ky', '/xe/1')).toBe('/dang-ky?next=%2Fxe%2F1');
    expect(withNext('/dang-ky', '/')).toBe('/dang-ky');
    expect(withNext('/dang-ky', 'https://evil.example')).toBe('/dang-ky');
  });
});
