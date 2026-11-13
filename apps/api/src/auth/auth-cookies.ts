import { type CookieOptions, type Response } from 'express';

import { type AppConfigService } from '../config/env.js';
import {
  ACCESS_COOKIE,
  AUTH_POLICY,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
} from './auth.constants.js';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/** Sets and clears the httpOnly auth cookies. */
export class AuthCookies {
  private readonly base: CookieOptions;

  constructor(config: AppConfigService) {
    this.base = {
      httpOnly: true,
      // Lax: sent on top-level navigation and same-site requests only, which also blocks
      // cross-site form posts (CSRF). Web and API must therefore be on the same site.
      sameSite: 'lax',
      secure: config.get('NODE_ENV', { infer: true }) === 'production',
      domain: config.get('COOKIE_DOMAIN', { infer: true }),
    };
  }

  set(res: Response, tokens: IssuedTokens) {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...this.base,
      path: '/',
      maxAge: AUTH_POLICY.accessTokenTtlSeconds * 1000,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.base,
      path: REFRESH_COOKIE_PATH,
      maxAge: AUTH_POLICY.refreshTokenTtlSeconds * 1000,
    });
  }

  clear(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { ...this.base, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...this.base, path: REFRESH_COOKIE_PATH });
  }
}
