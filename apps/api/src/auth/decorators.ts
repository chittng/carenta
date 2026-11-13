import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';

import { ACCESS_COOKIE } from './auth.constants.js';
import { type SessionUser } from './sessions.service.js';

export const IS_PUBLIC = 'auth:public';
export const ROLES = 'auth:roles';
export const REQUIRE_VERIFIED_EMAIL = 'auth:verified-email';

/** The authenticated caller, attached to the request by AuthGuard. */
export interface RequestAuth {
  user: SessionUser;
  sessionId: string;
}

export interface AuthenticatedRequest {
  auth?: RequestAuth;
}

/**
 * Every route needs a signed-in user unless marked public. On public routes a valid
 * session is still attached, so `@CurrentAuth()` can be optional there.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route (or controller) to these roles, e.g. `@Roles('ADMIN')` for Console. */
export const Roles = (...roles: SessionUser['role'][]) =>
  applyDecorators(SetMetadata(ROLES, roles), ApiCookieAuth(ACCESS_COOKIE));

/**
 * Blocks users whose email is not verified (EMAIL_NOT_VERIFIED): booking, listing a car,
 * submitting a driver license, chat, withdrawals. Decided 2026-11-13, see spec §3.
 */
export const RequireVerifiedEmail = () => SetMetadata(REQUIRE_VERIFIED_EMAIL, true);

/** The signed-in user and session. Use on routes that are not `@Public()`. */
export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const auth = ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  if (!auth) throw new Error('CurrentAuth used on a route without an authenticated user');
  return auth;
});

/** Like `CurrentAuth`, but `undefined` for anonymous callers on `@Public()` routes. */
export const OptionalAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth,
);
