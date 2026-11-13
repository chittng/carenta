import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import {
  type ConsoleUser,
  type ConsoleUserListQuery,
  type ConsoleUserSummary,
  ErrorCode,
  type Page,
  UserStatus,
} from '@carenta/shared';

import { SessionsService } from '../auth/sessions.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { type Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../storage/uploads.service.js';

const SUMMARY_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  driverLicense: { select: { status: true } },
  _count: { select: { cars: true } },
} as const satisfies Prisma.UserSelect;

type SummaryRecord = Prisma.UserGetPayload<{ select: typeof SUMMARY_SELECT }>;

const toSummary = (user: SummaryRecord): ConsoleUserSummary => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  phone: user.phone,
  role: user.role,
  status: user.status,
  emailVerified: user.emailVerifiedAt !== null,
  driverLicenseStatus: user.driverLicense?.status ?? null,
  carCount: user._count.cars,
  createdAt: user.createdAt.toISOString(),
});

const userNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Không tìm thấy người dùng.');

/**
 * Users in Console (spec §11): search, details, lock and unlock (decided 2026-11-14: a
 * reason is required, every session ends at once, the user is emailed; admins cannot be
 * locked). Cancelling the user's bookings on lock (spec §12.5) comes with bookings.
 */
@Injectable()
export class ConsoleUsersService {
  private readonly logger = new Logger(ConsoleUsersService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async list(query: ConsoleUserListQuery): Promise<Page<ConsoleUserSummary>> {
    const phoneDigits = query.q?.replace(/\D/g, '');
    const where: Prisma.UserWhereInput = {
      status: query.status,
      role: query.role,
      ...(query.q && {
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q.toLowerCase() } },
          ...(phoneDigits ? [{ phone: { contains: phoneDigits } }] : []),
        ],
      }),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: SUMMARY_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: users.map(toSummary), page: query.page, pageSize: query.pageSize, total };
  }

  async get(userId: string): Promise<ConsoleUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...SUMMARY_SELECT,
        avatarKey: true,
        lockedAt: true,
        lockReason: true,
        cars: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            year: true,
            licensePlate: true,
            model: { select: { id: true, name: true, make: { select: { id: true, name: true } } } },
          },
        },
        _count: { select: { cars: true, bookingsAsRenter: true, bookingsAsOwner: true } },
      },
    });
    if (!user) throw userNotFound();
    return {
      ...toSummary(user),
      avatarUrl: user.avatarKey ? this.uploads.avatarUrl(user.avatarKey) : null,
      lockedAt: user.lockedAt?.toISOString() ?? null,
      lockReason: user.lockReason,
      cars: user.cars.map((car) => ({
        id: car.id,
        status: car.status,
        make: car.model.make,
        model: { id: car.model.id, name: car.model.name },
        year: car.year,
        licensePlate: car.licensePlate,
      })),
      bookingCount: {
        asRenter: user._count.bookingsAsRenter,
        asOwner: user._count.bookingsAsOwner,
      },
    };
  }

  /**
   * Locks the account and signs it out everywhere. Their cars drop out of search, which
   * only shows cars of active owners (CARENTA-23).
   */
  async lock(adminId: string, userId: string, reason: string): Promise<ConsoleUser> {
    const user = await this.prisma.$transaction(async (tx) => {
      const found = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, fullName: true, role: true, status: true },
      });
      if (!found) throw userNotFound();
      if (found.role === 'ADMIN' || found.id === adminId) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          ErrorCode.FORBIDDEN,
          'Không thể khoá tài khoản admin.',
        );
      }
      // Conditional update, so two admins locking at once do not both succeed.
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: UserStatus.ACTIVE },
        data: { status: UserStatus.LOCKED, lockedAt: new Date(), lockReason: reason },
      });
      if (count === 0) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.USER_STATUS_CONFLICT,
          'Tài khoản đã bị khoá.',
        );
      }
      return found;
    });
    await this.sessions.revokeAllForUser(userId);
    await this.notify(() =>
      this.mail.send('account.locked', {
        to: user.email,
        userId: user.id,
        data: { fullName: user.fullName, reason },
      }),
    );
    return this.get(userId);
  }

  async unlock(userId: string): Promise<ConsoleUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true },
    });
    if (!user) throw userNotFound();
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, status: UserStatus.LOCKED },
      data: { status: UserStatus.ACTIVE, lockedAt: null, lockReason: null },
    });
    if (count === 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.USER_STATUS_CONFLICT,
        'Tài khoản không bị khoá.',
      );
    }
    await this.notify(() =>
      this.mail.send('account.unlocked', {
        to: user.email,
        userId: user.id,
        data: { fullName: user.fullName },
      }),
    );
    return this.get(userId);
  }

  /** A failure to queue the email is logged and does not undo the change. */
  private async notify(send: () => Promise<unknown>) {
    try {
      await send();
    } catch (error) {
      this.logger.error(`Could not queue account email: ${String(error)}`);
    }
  }
}
