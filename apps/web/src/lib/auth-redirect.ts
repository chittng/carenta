import { routes } from './navigation';

/** Pages a visitor is sent back from after signing in; returning to them would loop. */
const AUTH_PAGES: readonly string[] = [
  routes.signIn,
  routes.signUp,
  '/quen-mat-khau',
  '/xac-thuc-email',
];

/**
 * Where to go after signing in or up: the `next` page if it is a path on this site, else home.
 * Anything else (`https://…`, `//evil.example`, `/\evil.example`) would be an open redirect.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return routes.home;
  }
  // Control characters can smuggle a different host past the checks above in some browsers.
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(next)) return routes.home;
  const path = next.split(/[?#]/, 1)[0] ?? '';
  if (AUTH_PAGES.some((page) => path === page || path.startsWith(`${page}/`))) return routes.home;
  return next;
}

/** Link to an auth page that keeps the `next` destination, e.g. from sign-in to sign-up. */
export function withNext(href: string, next: string | null | undefined): string {
  const target = safeNext(next);
  return target === routes.home ? href : `${href}?next=${encodeURIComponent(target)}`;
}
