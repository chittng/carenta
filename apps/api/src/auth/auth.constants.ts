const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Decided 2026-11-13 (CARENTA-10); recorded in docs/SPEC.md. */
export const AUTH_POLICY = {
  accessTokenTtlSeconds: 15 * MINUTE,
  /** Sliding: each refresh starts a new 30 days, so only 30 idle days sign a device out. */
  refreshTokenTtlSeconds: 30 * DAY,
  emailVerificationTtlSeconds: 24 * HOUR,
  passwordResetTtlSeconds: 30 * MINUTE,

  // [Đề xuất] abuse limits
  loginFailures: { limit: 5, windowSeconds: 15 * MINUTE },
  /** Per email, for verification and password reset emails separately. */
  authEmails: { limit: 3, windowSeconds: HOUR, cooldownSeconds: 60 },

  /**
   * Two tabs refreshing at once both present the same token; the slower one finds it
   * already rotated. Within this window that is treated as a race, not token theft.
   */
  refreshReuseGraceSeconds: 30,
} as const;

export const ACCESS_COOKIE = 'carenta_access';
export const REFRESH_COOKIE = 'carenta_refresh';
/** The refresh cookie is only sent to the auth endpoints that need it. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
