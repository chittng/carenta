import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { UserStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AUTH_POLICY } from './auth.constants.js';
import { hashToken, randomToken } from './tokens.js';

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface NewSession {
  sessionId: string;
  refreshToken: string;
}

/** The user behind a live session, as the auth guard needs it. */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  emailVerifiedAt: Date | null;
}

const USER_FIELDS = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  emailVerifiedAt: true,
  status: true,
} as const;

/**
 * Signed-in devices (UserSession rows) and refresh token rotation.
 *
 * Every refresh replaces the session row with a new one in the same family. Presenting an
 * already-rotated token again means it was copied, so the whole family is revoked and the
 * device (and the thief) must sign in again.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(userId: string, meta: SessionMeta, familyId = randomUUID()): Promise<NewSession> {
    const refreshToken = randomToken();
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + AUTH_POLICY.refreshTokenTtlSeconds * 1000),
        userAgent: meta.userAgent?.slice(0, 500),
        ip: meta.ip,
      },
      select: { id: true },
    });
    return { sessionId: session.id, refreshToken };
  }

  /**
   * Exchanges a refresh token for a new one. Returns null when the token cannot be used:
   * unknown, expired, revoked, rotated (reuse), or the account is locked.
   */
  async rotate(
    refreshToken: string,
    meta: SessionMeta,
  ): Promise<(NewSession & { userId: string }) | null> {
    const now = new Date();
    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { user: { select: { status: true } } },
    });
    if (!session) return null;

    if (session.revokedAt) {
      const secondsSince = (now.getTime() - session.revokedAt.getTime()) / 1000;
      if (session.replacedById && secondsSince > AUTH_POLICY.refreshReuseGraceSeconds) {
        this.logger.warn(`Refresh token reuse for user ${session.userId}; revoking its sessions`);
        await this.revokeFamily(session.familyId);
      }
      return null;
    }
    if (session.expiresAt <= now || session.user.status !== UserStatus.ACTIVE) return null;

    return this.prisma.$transaction(async (tx) => {
      const next = randomToken();
      const created = await tx.userSession.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          refreshTokenHash: hashToken(next),
          expiresAt: new Date(now.getTime() + AUTH_POLICY.refreshTokenTtlSeconds * 1000),
          userAgent: meta.userAgent?.slice(0, 500),
          ip: meta.ip,
        },
        select: { id: true },
      });
      // Conditional so two concurrent refreshes cannot both rotate the same token.
      const { count } = await tx.userSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now, replacedById: created.id },
      });
      if (count === 0) {
        await tx.userSession.delete({ where: { id: created.id } });
        return null;
      }
      return { sessionId: created.id, refreshToken: next, userId: session.userId };
    });
  }

  /**
   * The user of a live session, for authenticating a request. Null if the session was
   * revoked or expired, or the account is locked, so those take effect immediately.
   */
  async findActiveUser(sessionId: string, userId: string): Promise<SessionUser | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true, user: { select: USER_FIELDS } },
    });
    if (
      !session ||
      session.userId !== userId ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      return null;
    }
    const { status: _status, ...user } = session.user;
    return user;
  }

  /** Signs one device out. Accepts either the session id or its refresh token. */
  async revoke(ref: { sessionId?: string; refreshToken?: string }): Promise<void> {
    const where = ref.sessionId
      ? { id: ref.sessionId }
      : ref.refreshToken
        ? { refreshTokenHash: hashToken(ref.refreshToken) }
        : null;
    if (!where) return;
    await this.prisma.userSession.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Signs the user out everywhere, optionally keeping the current device. */
  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
