import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';

import { ErrorCode } from '@carenta/shared';

import { AppException } from '../common/errors/app.exception.js';
import { AccessTokenService } from './access-token.service.js';
import { ACCESS_COOKIE } from './auth.constants.js';
import {
  type AuthenticatedRequest,
  IS_PUBLIC,
  REQUIRE_VERIFIED_EMAIL,
  type RequestAuth,
  ROLES,
} from './decorators.js';
import { SessionsService, type SessionUser } from './sessions.service.js';

/**
 * Global guard: authenticates from the access cookie, then applies `@Public()`,
 * `@Roles()` and `@RequireVerifiedEmail()`. A 401 tells the web app to call
 * `POST /auth/refresh` and retry once.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessTokenService) private readonly accessTokens: AccessTokenService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request & AuthenticatedRequest>();
    const targets = [context.getHandler(), context.getClass()];

    const auth = await this.authenticate(request);
    if (auth) request.auth = auth;

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    if (!auth) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.UNAUTHORIZED,
        'Vui lòng đăng nhập để tiếp tục.',
      );
    }

    const roles = this.reflector.getAllAndOverride<SessionUser['role'][] | undefined>(
      ROLES,
      targets,
    );
    if (roles && !roles.includes(auth.user.role)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'Bạn không có quyền thực hiện thao tác này.',
      );
    }

    if (
      this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_EMAIL, targets) &&
      !auth.user.emailVerifiedAt
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Vui lòng xác thực email trước khi thực hiện thao tác này.',
      );
    }
    return true;
  }

  private async authenticate(request: Request): Promise<RequestAuth | null> {
    const token: unknown = request.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token === '') return null;
    const claims = await this.accessTokens.verify(token);
    if (!claims) return null;
    const user = await this.sessions.findActiveUser(claims.sessionId, claims.userId);
    return user ? { user, sessionId: claims.sessionId } : null;
  }
}
