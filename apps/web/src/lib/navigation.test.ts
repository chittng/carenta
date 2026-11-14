import { describe, expect, it } from 'vitest';

import { initials } from '@/components/layout/user-avatar';

import { accountNav, consoleNav, isActivePath, mobileTabs, routes } from './navigation';

describe('isActivePath', () => {
  it('matches the page itself and pages below it', () => {
    expect(isActivePath('/xe-cua-toi', '/xe-cua-toi')).toBe(true);
    expect(isActivePath('/xe-cua-toi/moi', '/xe-cua-toi')).toBe(true);
  });

  it('does not match a path that only shares a prefix', () => {
    expect(isActivePath('/xe-cua-toi-khac', '/xe-cua-toi')).toBe(false);
    expect(isActivePath('/xe/123', '/xe-cua-toi')).toBe(false);
  });

  it('matches home only on home', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/tim-xe', '/')).toBe(false);
  });
});

describe('navigation config', () => {
  it('uses the unaccented Vietnamese paths from SPEC §13', () => {
    const hrefs = [
      ...Object.values(routes),
      ...accountNav.map((item) => item.href),
      ...mobileTabs.map((item) => item.href),
      ...consoleNav.flatMap((group) => group.items.map((item) => item.href)),
    ];
    for (const href of hrefs) expect(href).toMatch(/^\/[a-z0-9/-]*$/);
  });

  it('keeps every Console link under /console', () => {
    for (const group of consoleNav) {
      for (const item of group.items) expect(isActivePath(item.href, routes.console)).toBe(true);
    }
  });
});

describe('initials', () => {
  it('takes the first letters of the first and last words', () => {
    expect(initials('Nguyễn Văn An')).toBe('NA');
    expect(initials('  đỗ   thị   ánh  ')).toBe('ĐÁ');
  });

  it('handles a single word', () => {
    expect(initials('Admin')).toBe('A');
  });
});
