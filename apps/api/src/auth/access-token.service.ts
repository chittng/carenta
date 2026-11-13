import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';

import { AppConfigService } from '../config/env.js';
import { AUTH_POLICY } from './auth.constants.js';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

const ISSUER = 'carenta-api';
const ALGORITHM = 'HS256';

/**
 * Short-lived access tokens (JWT, HS256). They carry only the user and session ids; every
 * request still loads the session, so revoking it (logout, password change, account lock)
 * takes effect immediately rather than when the token expires.
 */
@Injectable()
export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.key = new TextEncoder().encode(config.get('JWT_SECRET', { infer: true }));
  }

  sign(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${AUTH_POLICY.accessTokenTtlSeconds}s`)
      .sign(this.key);
  }

  /** The claims of a valid, unexpired token; `null` for anything else. */
  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: [ALGORITHM],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }
}
