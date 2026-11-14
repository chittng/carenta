import { HttpStatus, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import {
  type ConsoleDriverLicense,
  type ConsoleDriverLicenseListQuery,
  type ConsoleDriverLicenseSummary,
  DRIVER_LICENSE_CLASS_LABELS,
  DRIVER_LICENSE_EXPIRY_REMINDER_DAYS,
  DriverLicenseStatus,
  ErrorCode,
  type MyDriverLicenses,
  type Page,
  type SubmitDriverLicenseInput,
  vietnamDate,
} from '@carenta/shared';

import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { JobsService, QueueName } from '../jobs/jobs.service.js';
import { MailService } from '../mail/mail.service.js';
import { formatDate } from '../mail/templates/format.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../storage/uploads.service.js';
import {
  CURRENT_STATUSES,
  type DriverLicenseRecord,
  SUBMISSION_STATUSES,
  toDriverLicense,
} from './driver-licenses.mapper.js';

type Tx = Prisma.TransactionClient;

const REMINDER_JOB = 'driver-license-expiry-reminder';
const EXPIRY_JOB = 'driver-license-expiry';

interface LicenseJob {
  licenseId: string;
  /** The expiry the job was scheduled for; a job for an older date does nothing. */
  expiresOn: string;
}

const userRef = { select: { id: true, fullName: true, email: true } } as const;

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Không tìm thấy GPLX.');

const statusConflict = (message: string) =>
  new AppException(HttpStatus.CONFLICT, ErrorCode.DRIVER_LICENSE_STATUS_CONFLICT, message);

const licenseTaken = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.DRIVER_LICENSE_TAKEN,
    'Số GPLX này đã được dùng ở một tài khoản khác. Nếu đây là GPLX của bạn, vui lòng liên hệ hỗ trợ.',
  );

/** 09:00 in Vietnam on the day `days` after the date `YYYY-MM-DD` (negative: before). */
function vietnamMorning(date: string, days: number): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 9 - 7));
}

/** Midnight in Vietnam at the start of the day after `date`: when the license lapses. */
function dayAfterInVietnam(date: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, -7));
}

/**
 * Driver licenses (spec §3, §12.2). A user submits both sides and the details; an admin
 * approves or rejects with a reason. A renewal waits for review while the approved
 * license stays usable, and replaces it once approved (decided 2026-11-14). An approved
 * license gets a reminder 30 days before it expires and turns EXPIRED the day after.
 */
@Injectable()
export class DriverLicensesService implements OnModuleInit {
  private readonly logger = new Logger(DriverLicensesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register<LicenseJob>(QueueName.SCHEDULED, REMINDER_JOB, (job) =>
      this.remindExpiry(job.data),
    );
    this.jobs.register<LicenseJob>(QueueName.SCHEDULED, EXPIRY_JOB, (job) => this.expire(job.data));
  }

  async getMine(userId: string): Promise<MyDriverLicenses> {
    const licenses = await this.prisma.driverLicense.findMany({ where: { userId } });
    const current = licenses.find((l) => CURRENT_STATUSES.includes(l.status));
    const submission = licenses.find((l) => SUBMISSION_STATUSES.includes(l.status));
    return {
      current: current ? await toDriverLicense(this.uploads, current) : null,
      submission: submission ? await toDriverLicense(this.uploads, submission) : null,
    };
  }

  /**
   * Submits a license for review, replacing an earlier submission (pending or rejected).
   * The approved license, if any, stays in use until this one is approved.
   */
  async submit(userId: string, input: SubmitDriverLicenseInput): Promise<MyDriverLicenses> {
    // Cheap check before processing the images; repeated under a lock below.
    if (await this.numberUsedElsewhere(this.prisma, userId, input.licenseNumber)) {
      throw licenseTaken();
    }

    const front = await this.uploads.claim(userId, 'DRIVER_LICENSE', input.frontUploadKey);
    let back: string;
    try {
      back = await this.uploads.claim(userId, 'DRIVER_LICENSE', input.backUploadKey);
    } catch (error) {
      await this.removeFiles([front]);
      throw error;
    }

    let replaced: string[];
    try {
      replaced = await this.prisma.$transaction(async (tx) => {
        // Serialises submissions of the same number, so two accounts cannot both pass.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.licenseNumber}))`;
        if (await this.numberUsedElsewhere(tx, userId, input.licenseNumber)) {
          throw licenseTaken();
        }
        const previous = await tx.driverLicense.findMany({
          where: { userId, status: { in: [...SUBMISSION_STATUSES] } },
          select: { id: true, frontImageKey: true, backImageKey: true },
        });
        await tx.driverLicense.deleteMany({ where: { id: { in: previous.map((l) => l.id) } } });
        await tx.driverLicense.create({
          data: {
            userId,
            fullName: input.fullName,
            licenseNumber: input.licenseNumber,
            licenseClass: input.licenseClass,
            dateOfBirth: fromDateOnly(input.dateOfBirth),
            expiresOn: fromDateOnly(input.expiresOn),
            frontImageKey: front,
            backImageKey: back,
          },
        });
        return previous.flatMap((l) => [l.frontImageKey, l.backImageKey]);
      });
    } catch (error) {
      await this.removeFiles([front, back]);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.CONFLICT,
          'GPLX vừa được nộp từ một phiên khác. Vui lòng tải lại trang.',
        );
      }
      throw error;
    }
    await this.removeFiles(replaced);
    return this.getMine(userId);
  }

  // ─── Console ──────────────────────────────────────────────────────────────

  async list(query: ConsoleDriverLicenseListQuery): Promise<Page<ConsoleDriverLicenseSummary>> {
    const where = { status: query.status };
    const [licenses, total] = await Promise.all([
      this.prisma.driverLicense.findMany({
        where,
        // The pending queue is worked oldest first; other lists show the latest first.
        orderBy:
          query.status === DriverLicenseStatus.PENDING
            ? [{ submittedAt: 'asc' }, { id: 'asc' }]
            : [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          user: {
            select: {
              ...userRef.select,
              driverLicenses: {
                where: { status: DriverLicenseStatus.APPROVED },
                select: { id: true },
              },
            },
          },
        },
      }),
      this.prisma.driverLicense.count({ where }),
    ]);
    return {
      items: licenses.map(({ user, ...license }) => ({
        id: license.id,
        status: license.status,
        fullName: license.fullName,
        licenseNumber: license.licenseNumber,
        licenseClass: license.licenseClass,
        dateOfBirth: toDateOnly(license.dateOfBirth),
        expiresOn: toDateOnly(license.expiresOn),
        rejectionReason: license.rejectionReason,
        submittedAt: license.submittedAt.toISOString(),
        reviewedAt: license.reviewedAt?.toISOString() ?? null,
        user: { id: user.id, fullName: user.fullName, email: user.email },
        isRenewal: user.driverLicenses.some((l) => l.id !== license.id),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(licenseId: string): Promise<ConsoleDriverLicense> {
    const license = await this.prisma.driverLicense.findUnique({
      where: { id: licenseId },
      include: { user: userRef, reviewedBy: userRef },
    });
    if (!license) throw notFound();
    const current = SUBMISSION_STATUSES.includes(license.status)
      ? await this.prisma.driverLicense.findFirst({
          where: { userId: license.userId, status: { in: [...CURRENT_STATUSES] } },
        })
      : null;
    return {
      ...(await toDriverLicense(this.uploads, license)),
      user: license.user,
      current: current ? await toDriverLicense(this.uploads, current) : null,
      reviewedBy: license.reviewedBy,
    };
  }

  /**
   * Approves a pending license. It replaces the user's previous license, whose images
   * are deleted, and gets its expiry reminder and expiry scheduled.
   */
  async approve(adminId: string, licenseId: string): Promise<ConsoleDriverLicense> {
    const { license, replaced } = await this.prisma.$transaction(async (tx) => {
      const pending = await lockPending(tx, licenseId);
      if (toDateOnly(pending.expiresOn) < vietnamDate()) {
        throw statusConflict('GPLX đã hết hạn. Hãy từ chối và đề nghị người dùng nộp GPLX mới.');
      }
      const old = await tx.driverLicense.findFirst({
        where: { userId: pending.userId, status: { in: [...CURRENT_STATUSES] } },
      });
      if (old) await tx.driverLicense.delete({ where: { id: old.id } });
      const approved = await tx.driverLicense.update({
        where: { id: licenseId },
        data: {
          status: DriverLicenseStatus.APPROVED,
          rejectionReason: null,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
        include: { user: userRef },
      });
      return { license: approved, replaced: old };
    });

    if (replaced) {
      await this.removeFiles([replaced.frontImageKey, replaced.backImageKey]);
      await this.cancelJobs(replaced.id);
    }
    await this.scheduleJobs(license);
    await this.notify(() =>
      this.mail.send('driver-license.approved', {
        to: license.user.email,
        userId: license.user.id,
        data: {
          fullName: license.user.fullName,
          licenseClass: DRIVER_LICENSE_CLASS_LABELS[license.licenseClass],
          expiresOn: formatDate(license.expiresOn),
        },
      }),
    );
    return this.get(licenseId);
  }

  /** Rejects a pending license; the approved one, if any, stays in use. */
  async reject(adminId: string, licenseId: string, reason: string): Promise<ConsoleDriverLicense> {
    const license = await this.prisma.$transaction(async (tx) => {
      await lockPending(tx, licenseId);
      return tx.driverLicense.update({
        where: { id: licenseId },
        data: {
          status: DriverLicenseStatus.REJECTED,
          rejectionReason: reason,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
        include: { user: userRef },
      });
    });
    await this.notify(() =>
      this.mail.send('driver-license.rejected', {
        to: license.user.email,
        userId: license.user.id,
        data: { fullName: license.user.fullName, reason },
      }),
    );
    return this.get(licenseId);
  }

  // ─── Expiry (scheduled jobs; idempotent, re-read the license) ─────────────

  /** Emails the holder 30 days before expiry, unless a renewal is already waiting. */
  async remindExpiry({ licenseId, expiresOn }: LicenseJob): Promise<void> {
    const license = await this.prisma.driverLicense.findUnique({
      where: { id: licenseId },
      include: {
        user: {
          select: {
            ...userRef.select,
            driverLicenses: {
              where: { status: DriverLicenseStatus.PENDING },
              select: { id: true },
            },
          },
        },
      },
    });
    if (
      !license ||
      license.status !== DriverLicenseStatus.APPROVED ||
      toDateOnly(license.expiresOn) !== expiresOn ||
      license.user.driverLicenses.length > 0
    ) {
      return;
    }
    await this.mail.send('driver-license.expiring', {
      to: license.user.email,
      userId: license.user.id,
      data: { fullName: license.user.fullName, expiresOn: formatDate(license.expiresOn) },
    });
  }

  /** Turns an approved license EXPIRED once its expiry day has passed in Vietnam. */
  async expire({ licenseId }: LicenseJob, now = new Date()): Promise<void> {
    const license = await this.prisma.driverLicense.findUnique({
      where: { id: licenseId },
      select: { status: true, expiresOn: true },
    });
    if (!license || license.status !== DriverLicenseStatus.APPROVED) return;
    if (toDateOnly(license.expiresOn) >= vietnamDate(now)) return;
    await this.prisma.driverLicense.updateMany({
      where: { id: licenseId, status: DriverLicenseStatus.APPROVED },
      data: { status: DriverLicenseStatus.EXPIRED },
    });
  }

  private async scheduleJobs(license: DriverLicenseRecord) {
    const expiresOn = toDateOnly(license.expiresOn);
    const data: LicenseJob = { licenseId: license.id, expiresOn };
    try {
      await this.jobs.schedule(REMINDER_JOB, data, {
        runAt: vietnamMorning(expiresOn, -DRIVER_LICENSE_EXPIRY_REMINDER_DAYS),
        jobId: `${REMINDER_JOB}.${license.id}`,
      });
      await this.jobs.schedule(EXPIRY_JOB, data, {
        runAt: dayAfterInVietnam(expiresOn),
        jobId: `${EXPIRY_JOB}.${license.id}`,
      });
    } catch (error) {
      this.logger.error(
        `Could not schedule expiry jobs for license ${license.id}: ${String(error)}`,
      );
    }
  }

  private async cancelJobs(licenseId: string) {
    try {
      await this.jobs.cancel(`${REMINDER_JOB}.${licenseId}`);
      await this.jobs.cancel(`${EXPIRY_JOB}.${licenseId}`);
    } catch (error) {
      // Harmless: the jobs find the license gone and do nothing.
      this.logger.warn(`Could not cancel expiry jobs for license ${licenseId}: ${String(error)}`);
    }
  }

  /**
   * Whether another account holds this number in a pending or approved license
   * (decided 2026-11-14: one license number, one account).
   */
  private async numberUsedElsewhere(db: Tx, userId: string, licenseNumber: string) {
    const other = await db.driverLicense.findFirst({
      where: {
        licenseNumber,
        userId: { not: userId },
        status: { in: [DriverLicenseStatus.PENDING, DriverLicenseStatus.APPROVED] },
      },
      select: { id: true },
    });
    return other !== null;
  }

  /** A failure to queue the email is logged and does not undo the decision. */
  private async notify(send: () => Promise<unknown>) {
    try {
      await send();
    } catch (error) {
      this.logger.error(`Could not queue driver license email: ${String(error)}`);
    }
  }

  /** Storage cleanup after the DB change; a failure only leaves an orphan file. */
  private async removeFiles(keys: string[]) {
    await Promise.all(
      keys.map((key) =>
        this.uploads.remove('DRIVER_LICENSE', key).catch((error: unknown) => {
          this.logger.warn(`Could not delete DRIVER_LICENSE ${key}: ${String(error)}`);
        }),
      ),
    );
  }
}

/** Locks a pending license for review, so two admins cannot decide at once. */
async function lockPending(tx: Tx, licenseId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM driver_licenses WHERE id = ${licenseId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound();
  const license = await tx.driverLicense.findUniqueOrThrow({ where: { id: licenseId } });
  if (license.status !== DriverLicenseStatus.PENDING) {
    throw statusConflict('GPLX không ở trạng thái chờ duyệt.');
  }
  return license;
}
