import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import {
  authUserSchema,
  changePasswordSchema,
  ErrorCode,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@carenta/shared';

import { AppException } from '../common/errors/app.exception.js';
import { AppConfigService } from '../config/env.js';
import { ErrorResponseDto } from '../docs/api-docs.js';
import { AuthCookies } from './auth-cookies.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.constants.js';
import { AuthService, toAuthUser } from './auth.service.js';
import { CurrentAuth, OptionalAuth, Public, type RequestAuth } from './decorators.js';
import { type SessionMeta } from './sessions.service.js';

class RegisterDto extends createZodDto(registerSchema) {}
class LoginDto extends createZodDto(loginSchema) {}
class VerifyEmailDto extends createZodDto(verifyEmailSchema) {}
class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
class AuthUserDto extends createZodDto(authUserSchema) {}

function sessionMeta(req: Request): SessionMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

@ApiTags('Tài khoản')
@Controller('auth')
export class AuthController {
  private readonly cookies: AuthCookies;

  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.cookies = new AuthCookies(config);
  }

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Đăng ký',
    description: 'Tạo tài khoản, đăng nhập luôn (đặt cookie) và gửi email xác thực.',
  })
  @ZodResponse({ status: 201, description: 'Tài khoản vừa tạo', type: AuthUserDto })
  @ApiConflictResponse({ description: 'EMAIL_TAKEN', type: ErrorResponseDto })
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    const { user, tokens } = await this.auth.register(body, sessionMeta(req));
    this.cookies.set(res, tokens);
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập', description: 'Đặt cookie access và refresh token.' })
  @ZodResponse({ status: 200, description: 'Người dùng đã đăng nhập', type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS', type: ErrorResponseDto })
  @ApiForbiddenResponse({ description: 'ACCOUNT_LOCKED', type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({
    description: 'Sai mật khẩu 5 lần trong 15 phút',
    type: ErrorResponseDto,
  })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthUserDto> {
    const { user, tokens } = await this.auth.login(body, sessionMeta(req));
    this.cookies.set(res, tokens);
    return user;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Làm mới phiên',
    description:
      'Đổi refresh token (cookie) lấy cặp token mới. Web gọi khi một request trả 401 rồi thử lại. Nếu trả 401 thì phải đăng nhập lại.',
  })
  @ApiNoContentResponse({ description: 'Đã đặt cookie mới' })
  @ApiUnauthorizedResponse({
    description: 'Phiên hết hạn hoặc không hợp lệ',
    type: ErrorResponseDto,
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const refreshToken: unknown = req.cookies?.[REFRESH_COOKIE];
    const tokens =
      typeof refreshToken === 'string' && refreshToken !== ''
        ? await this.auth.refresh(refreshToken, sessionMeta(req))
        : null;
    if (!tokens) {
      this.cookies.clear(res);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.UNAUTHORIZED,
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      );
    }
    this.cookies.set(res, tokens);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng xuất', description: 'Kết thúc phiên trên thiết bị này.' })
  @ApiNoContentResponse({ description: 'Đã đăng xuất' })
  async logout(
    @OptionalAuth() auth: RequestAuth | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken: unknown = req.cookies?.[REFRESH_COOKIE];
    await this.auth.logout({
      sessionId: auth?.sessionId,
      refreshToken: typeof refreshToken === 'string' ? refreshToken : undefined,
    });
    this.cookies.clear(res);
  }

  @Get('me')
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({ summary: 'Người dùng hiện tại' })
  @ZodResponse({ status: 200, description: 'Người dùng đang đăng nhập', type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập', type: ErrorResponseDto })
  me(@CurrentAuth() auth: RequestAuth): AuthUserDto {
    return toAuthUser(auth.user);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xác thực email',
    description:
      'Nhận token từ link trong email (`/xac-thuc-email?token=...`). Link hiệu lực 24 giờ, dùng một lần.',
  })
  @ApiNoContentResponse({ description: 'Email đã được xác thực' })
  async verifyEmail(@Body() body: VerifyEmailDto): Promise<void> {
    await this.auth.verifyEmail(body.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({
    summary: 'Gửi lại email xác thực',
    description: 'Tối đa 3 lần mỗi giờ, cách nhau ít nhất 60 giây. Link cũ mất hiệu lực.',
  })
  @ApiNoContentResponse({ description: 'Đã gửi' })
  @ApiConflictResponse({ description: 'EMAIL_ALREADY_VERIFIED', type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Gửi quá nhiều lần', type: ErrorResponseDto })
  async resendVerification(@CurrentAuth() auth: RequestAuth): Promise<void> {
    await this.auth.resendVerification(auth.user);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Quên mật khẩu',
    description:
      'Gửi link đặt lại mật khẩu (`/quen-mat-khau?token=...`, hiệu lực 30 phút) nếu email có tài khoản. Luôn trả cùng một kết quả để không lộ email nào đã đăng ký.',
  })
  @ApiNoContentResponse({ description: 'Đã nhận yêu cầu' })
  @ApiTooManyRequestsResponse({ description: 'Gửi quá nhiều lần', type: ErrorResponseDto })
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<void> {
    await this.auth.forgotPassword(body.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đặt lại mật khẩu',
    description: 'Đặt mật khẩu mới bằng token trong link. Mọi thiết bị bị đăng xuất.',
  })
  @ApiNoContentResponse({ description: 'Đã đổi mật khẩu; người dùng đăng nhập lại' })
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.resetPassword(body);
    this.cookies.clear(res);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({
    summary: 'Đổi mật khẩu',
    description: 'Các thiết bị khác bị đăng xuất; thiết bị hiện tại giữ phiên.',
  })
  @ApiNoContentResponse({ description: 'Đã đổi mật khẩu' })
  async changePassword(
    @CurrentAuth() auth: RequestAuth,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    await this.auth.changePassword(auth.user, auth.sessionId, body);
  }
}
