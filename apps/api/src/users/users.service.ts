import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import {
  ErrorCode,
  type MyProfile,
  type PublicProfile,
  RESPONSE_RATE_WINDOW_DAYS,
  responseRatePercent,
  type UpdateProfileInput,
} from '@carenta/shared';

import { toDateOnly } from '../common/dates.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../storage/uploads.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The birth date on the user's license (decided 2026-11-14: no separate profile field):
 * the one in use, else the latest submission.
 */
function licenseBirthDate(licenses: { status: string; dateOfBirth: Date }[]): string | null {
  const license =
    licenses.find((l) => l.status === 'APPROVED' || l.status === 'EXPIRED') ?? licenses[0];
  return license ? toDateOnly(license.dateOfBirth) : null;
}

const PROFILE_SELECT = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  fullName: true,
  phone: true,
  avatarKey: true,
  createdAt: true,
  driverLicenses: { select: { status: true, dateOfBirth: true } },
} as const;

/** Profiles (spec §2, §13: `/tai-khoan`, `/nguoi-dung/[id]`). Password changes live in auth. */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}

  async getMine(userId: string): Promise<MyProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatarKey ? this.uploads.avatarUrl(user.avatarKey) : null,
      dateOfBirth: licenseBirthDate(user.driverLicenses),
      joinedAt: user.createdAt.toISOString(),
    };
  }

  async updateMine(userId: string, input: UpdateProfileInput): Promise<MyProfile> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: input.fullName, phone: input.phone },
    });
    return this.getMine(userId);
  }

  /** Replaces the avatar; the upload is validated and resized before anything is saved. */
  async setAvatar(userId: string, uploadKey: string): Promise<MyProfile> {
    const avatarKey = await this.uploads.claim(userId, 'AVATAR', uploadKey);
    let previous: string | null;
    try {
      previous = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { avatarKey: true },
        });
        await tx.user.update({ where: { id: userId }, data: { avatarKey } });
        return user.avatarKey;
      });
    } catch (error) {
      await this.removeAvatarFile(avatarKey);
      throw error;
    }
    if (previous) await this.removeAvatarFile(previous);
    return this.getMine(userId);
  }

  async removeAvatar(userId: string): Promise<MyProfile> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarKey: true },
    });
    if (user.avatarKey) {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarKey: null } });
      await this.removeAvatarFile(user.avatarKey);
    }
    return this.getMine(userId);
  }

  /**
   * Anyone's public profile. Locked accounts and admins have none (404), so their ids
   * cannot be probed.
   */
  async getPublic(userId: string, now = new Date()): Promise<PublicProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', role: 'USER' },
      select: { id: true, fullName: true, avatarKey: true, createdAt: true },
    });
    if (!user) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'Không tìm thấy người dùng.',
      );
    }

    const since = new Date(now.getTime() - RESPONSE_RATE_WINDOW_DAYS * DAY_MS);
    const [tripCount, rating, answers] = await Promise.all([
      this.prisma.booking.count({
        where: { status: 'COMPLETED', OR: [{ renterId: userId }, { ownerId: userId }] },
      }),
      this.prisma.review.aggregate({
        where: { subjectUserId: userId, publishedAt: { not: null } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      // How each booking request left PENDING_APPROVAL: the owner accepted or declined it,
      // or the system cancelled it at the deadline. Logged by the booking state machine.
      this.prisma.bookingStatusLog.groupBy({
        by: ['actorRole'],
        where: {
          fromStatus: 'PENDING_APPROVAL',
          actorRole: { in: ['OWNER', 'SYSTEM'] },
          booking: { ownerId: userId, createdAt: { gte: since } },
        },
        _count: { _all: true },
      }),
    ]);
    const countBy = (role: 'OWNER' | 'SYSTEM') =>
      answers.find((row) => row.actorRole === role)?._count._all ?? 0;
    const average = rating._avg.rating;

    return {
      id: user.id,
      fullName: user.fullName,
      avatarUrl: user.avatarKey ? this.uploads.avatarUrl(user.avatarKey) : null,
      joinedAt: user.createdAt.toISOString(),
      tripCount,
      rating: {
        average: average === null ? null : Math.round(average * 10) / 10,
        count: rating._count._all,
      },
      responseRate: responseRatePercent(countBy('OWNER'), countBy('SYSTEM')),
    };
  }

  /** Storage cleanup after the DB change; a failure only leaves an orphan file. */
  private async removeAvatarFile(key: string) {
    await this.uploads.remove('AVATAR', key).catch((error: unknown) => {
      this.logger.warn(`Could not delete avatar ${key}: ${String(error)}`);
    });
  }
}
