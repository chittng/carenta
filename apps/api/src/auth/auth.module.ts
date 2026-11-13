import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AccessTokenService } from './access-token.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * Accounts and sessions. `AuthGuard` is global: routes need a signed-in user unless
 * `@Public()`. `SessionsService` is exported so Console can sign a locked user out.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionsService,
    AccessTokenService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [SessionsService],
})
export class AuthModule {}
