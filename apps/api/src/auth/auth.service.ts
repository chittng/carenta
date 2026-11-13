import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

import {
  type AuthUser,
  type ChangePasswordInput,
  ErrorCode,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@carenta/shared';

import { AppException } from '../common/errors/app.exception.js';
import { AppConfigService } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { AuthTokenPurpose, UserStatus } from '../generated/prisma/enums.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import { AccessTokenService } from './access-token.service.js';
import { type IssuedTokens } from './auth-cookies.js';
import { AUTH_POLICY } from './auth.constants.js';
import { type SessionMeta, SessionsService, type SessionUser } from './sessions.service.js';
import { hashToken, randomToken } from './tokens.js';

export interface SignedIn {
  user: AuthUser;
  tokens: IssuedTokens;
}

/** Login form failures are counted per email and IP. */
const loginKey = (email: string, ip: string | undefined) => `login:${email}:${ip ?? 'unknown'}`;

const PURPOSE_SLUG = {
  [AuthTokenPurpose.EMAIL_VERIFICATION]: 'verify',
  [AuthTokenPurpose.PASSWORD_RESET]: 'reset',
} as const;

const minutes = (seconds: number) => Math.ceil(seconds / 60);

export function toAuthUser(user: SessionUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

/** Accounts, passwords, sessions and the one-time links sent by email (CARENTA-10). */
@Injectable()
export class AuthService {
  private readonly webUrl: string;
  /** Verified against when the email is unknown, so timing does not reveal which emails exist. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(AccessTokenService) private readonly accessTokens: AccessTokenService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(RateLimitService) private readonly rateLimit: RateLimitService,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  /** Creates the account, signs it in and sends the verification email. */
  async register(input: RegisterInput, meta: SessionMeta): Promise<SignedIn> {
    const passwordHash = await hash(input.password);
    let user: SessionUser;
    try {
      user = await this.prisma.user.create({
        data: { email: input.email, fullName: input.fullName, passwordHash },
        select: { id: true, email: true, fullName: true, role: true, emailVerifiedAt: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.EMAIL_TAKEN,
          'Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.',
        );
      }
      throw error;
    }

    await this.sendVerificationEmail(user);
    return this.signIn(user, meta);
  }

  async login(input: LoginInput, meta: SessionMeta): Promise<SignedIn> {
    const key = loginKey(input.email, meta.ip);
    const wait = await this.rateLimit.blockedFor(key, AUTH_POLICY.loginFailures.limit);
    if (wait !== null) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.TOO_MANY_REQUESTS,
        `Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes(wait)} phút.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        emailVerifiedAt: true,
        status: true,
        passwordHash: true,
      },
    });
    const valid = await verify(user?.passwordHash ?? (await this.getDummyHash()), input.password);
    if (!user || !valid) {
      await this.rateLimit.hit(key, AUTH_POLICY.loginFailures.windowSeconds);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_CREDENTIALS,
        'Email hoặc mật khẩu không đúng.',
      );
    }
    await this.rateLimit.reset(key);

    // Only revealed to someone who knows the password.
    if (user.status !== UserStatus.ACTIVE) throw accountLocked();

    const { status: _status, passwordHash: _hash, ...sessionUser } = user;
    return this.signIn(sessionUser, meta);
  }

  /** New tokens for a refresh token; null if it cannot be used (the client must log in). */
  async refresh(refreshToken: string, meta: SessionMeta): Promise<IssuedTokens | null> {
    const rotated = await this.sessions.rotate(refreshToken, meta);
    if (!rotated) return null;
    const accessToken = await this.accessTokens.sign({
      userId: rotated.userId,
      sessionId: rotated.sessionId,
    });
    return { accessToken, refreshToken: rotated.refreshToken };
  }

  logout(ref: { sessionId?: string; refreshToken?: string }): Promise<void> {
    return this.sessions.revoke(ref);
  }

  /** Confirms the email from the link. Using a valid link on a verified account is fine. */
  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consumeLinkToken(token, AuthTokenPurpose.EMAIL_VERIFICATION);
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async resendVerification(user: SessionUser): Promise<void> {
    if (user.emailVerifiedAt) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.EMAIL_ALREADY_VERIFIED,
        'Email của bạn đã được xác thực.',
      );
    }
    await this.limitAuthEmail(AuthTokenPurpose.EMAIL_VERIFICATION, user.email);
    await this.sendVerificationEmail(user);
  }

  /**
   * Sends a reset link if the email belongs to an active account. The response is the same
   * either way (the limit is applied to every email), so it does not reveal accounts.
   */
  async forgotPassword(email: string): Promise<void> {
    await this.limitAuthEmail(AuthTokenPurpose.PASSWORD_RESET, email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, fullName: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) return;

    const token = await this.issueLinkToken(user.id, AuthTokenPurpose.PASSWORD_RESET);
    await this.mail.send('auth.reset-password', {
      to: user.email,
      userId: user.id,
      data: { fullName: user.fullName, resetUrl: this.link('/quen-mat-khau', token) },
    });
  }

  /**
   * Sets a new password from a reset link and signs out every device. The link proves the
   * user controls the email, so it also counts as verifying it.
   */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const userId = await this.consumeLinkToken(input.token, AuthTokenPurpose.PASSWORD_RESET);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { status: true, emailVerifiedAt: true },
    });
    if (user.status !== UserStatus.ACTIVE) throw accountLocked();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hash(input.password),
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    await this.sessions.revokeAllForUser(userId);
  }

  /** Changes the password and signs out every other device. */
  async changePassword(
    user: SessionUser,
    sessionId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const { passwordHash } = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!(await verify(passwordHash, input.currentPassword))) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.WRONG_PASSWORD,
        'Mật khẩu hiện tại không đúng.',
      );
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(input.newPassword) },
    });
    await this.sessions.revokeAllForUser(user.id, sessionId);
  }

  private async signIn(user: SessionUser, meta: SessionMeta): Promise<SignedIn> {
    const session = await this.sessions.create(user.id, meta);
    const accessToken = await this.accessTokens.sign({
      userId: user.id,
      sessionId: session.sessionId,
    });
    return {
      user: toAuthUser(user),
      tokens: { accessToken, refreshToken: session.refreshToken },
    };
  }

  private async sendVerificationEmail(user: Pick<SessionUser, 'id' | 'email' | 'fullName'>) {
    const token = await this.issueLinkToken(user.id, AuthTokenPurpose.EMAIL_VERIFICATION);
    await this.mail.send('auth.verify-email', {
      to: user.email,
      userId: user.id,
      data: { fullName: user.fullName, verifyUrl: this.link('/xac-thuc-email', token) },
    });
  }

  /** A new one-time link token; earlier ones for the same purpose stop working. */
  private async issueLinkToken(userId: string, purpose: AuthTokenPurpose): Promise<string> {
    const token = randomToken();
    const ttl =
      purpose === AuthTokenPurpose.EMAIL_VERIFICATION
        ? AUTH_POLICY.emailVerificationTtlSeconds
        : AUTH_POLICY.passwordResetTtlSeconds;
    await this.prisma.$transaction([
      this.prisma.authToken.deleteMany({ where: { userId, purpose } }),
      this.prisma.authToken.create({
        data: {
          userId,
          purpose,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ttl * 1000),
        },
      }),
    ]);
    return token;
  }

  /** Deletes the token (one use) and returns its user, or throws INVALID_LINK. */
  private async consumeLinkToken(token: string, purpose: AuthTokenPurpose): Promise<string> {
    // deleteMany + the returned row in one statement: two clicks cannot both succeed.
    const [row] = await this.prisma.$queryRaw<{ user_id: string }[]>`
      DELETE FROM auth_tokens
      WHERE token_hash = ${hashToken(token)}
        AND purpose = ${purpose}::"AuthTokenPurpose"
        AND expires_at > now()
      RETURNING user_id`;
    if (!row) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.INVALID_LINK,
        purpose === AuthTokenPurpose.EMAIL_VERIFICATION
          ? 'Link xác thực không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập và gửi lại email xác thực.'
          : 'Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu link mới.',
      );
    }
    return row.user_id;
  }

  private async limitAuthEmail(purpose: AuthTokenPurpose, email: string): Promise<void> {
    const key = `auth-email:${PURPOSE_SLUG[purpose]}:${email}`;
    const cooldown = await this.rateLimit.cooldown(
      `${key}:cooldown`,
      AUTH_POLICY.authEmails.cooldownSeconds,
    );
    if (cooldown !== null) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.TOO_MANY_REQUESTS,
        `Email vừa được gửi. Vui lòng đợi ${cooldown} giây rồi thử lại.`,
      );
    }
    const wait = await this.rateLimit.consume(
      key,
      AUTH_POLICY.authEmails.limit,
      AUTH_POLICY.authEmails.windowSeconds,
    );
    if (wait !== null) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.TOO_MANY_REQUESTS,
        `Bạn đã yêu cầu gửi email quá nhiều lần. Vui lòng thử lại sau ${minutes(wait)} phút.`,
      );
    }
  }

  private link(path: string, token: string): string {
    return `${this.webUrl}${path}?token=${encodeURIComponent(token)}`;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash(randomToken());
    return this.dummyHash;
  }
}

function accountLocked() {
  return new AppException(
    HttpStatus.FORBIDDEN,
    ErrorCode.ACCOUNT_LOCKED,
    'Tài khoản của bạn đã bị khoá.',
  );
}
