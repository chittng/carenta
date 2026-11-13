import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import {
  CarRevisionStatus,
  CarStatus,
  type ConsoleCar,
  type ConsoleCarListQuery,
  type ConsoleCarSummary,
  type ConsoleRevisionSummary,
  ErrorCode,
  type Page,
} from '@carenta/shared';

import { OWNER_CAR_INCLUDE, toOwnerCar } from '../cars/cars.mapper.js';
import { missingForSubmission } from '../cars/cars.policy.js';
import { toDateOnly } from '../common/dates.js';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { type EmailData, type EmailTemplateName } from '../mail/templates/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../storage/uploads.service.js';

type Tx = Prisma.TransactionClient;

const userRef = { select: { id: true, fullName: true, email: true } } as const;
const modelWithMake = {
  select: { id: true, name: true, make: { select: { id: true, name: true } } },
} as const;

const CONSOLE_CAR_INCLUDE = {
  ...OWNER_CAR_INCLUDE,
  owner: { select: { id: true, fullName: true, email: true, phone: true, status: true } },
  reviewedBy: userRef,
} as const satisfies Prisma.CarInclude;

/** Car fields needed for the result email. */
interface LockedCar {
  id: string;
  status: CarStatus;
  ownerId: string;
}

/** Statuses an admin can hide or remove: the car has been approved (spec §11). */
const LISTED: ReadonlySet<CarStatus> = new Set([
  CarStatus.ACTIVE,
  CarStatus.PAUSED,
  CarStatus.HIDDEN,
]);

const carNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Không tìm thấy xe.');

const statusConflict = (message: string) =>
  new AppException(HttpStatus.CONFLICT, ErrorCode.CAR_STATUS_CONFLICT, message);

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Car review in Console (spec §11, §12.3): the queue of new cars and of changes to approved
 * cars, approve or reject with a reason, hide (reversible) or remove (final). Every
 * decision is emailed to the owner (spec §10).
 */
@Injectable()
export class ConsoleCarsService {
  private readonly logger = new Logger(ConsoleCarsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async list(query: ConsoleCarListQuery): Promise<Page<ConsoleCarSummary>> {
    const where: Prisma.CarWhereInput = {
      status: query.status,
      ...(query.q && {
        OR: [
          { licensePlate: { contains: query.q.toUpperCase() } },
          { owner: { fullName: { contains: query.q, mode: 'insensitive' } } },
          { owner: { email: { contains: query.q.toLowerCase() } } },
        ],
      }),
    };
    const orderBy: Prisma.CarOrderByWithRelationInput[] =
      query.status === CarStatus.PENDING_REVIEW
        ? [{ submittedAt: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'desc' }];
    const [cars, total] = await Promise.all([
      this.prisma.car.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          status: true,
          year: true,
          licensePlate: true,
          submittedAt: true,
          updatedAt: true,
          model: modelWithMake,
          owner: userRef,
          photos: { orderBy: { position: 'asc' }, take: 1, select: { fileKey: true } },
          revisions: { where: { status: CarRevisionStatus.PENDING }, select: { id: true } },
        },
      }),
      this.prisma.car.count({ where }),
    ]);
    return {
      items: cars.map((car) => {
        const cover = car.photos[0];
        return {
          id: car.id,
          status: car.status,
          make: car.model.make,
          model: { id: car.model.id, name: car.model.name },
          year: car.year,
          licensePlate: car.licensePlate,
          coverPhoto: cover ? this.uploads.carPhotoUrls(cover.fileKey) : null,
          owner: car.owner,
          hasPendingRevision: car.revisions.length > 0,
          submittedAt: car.submittedAt?.toISOString() ?? null,
          updatedAt: car.updatedAt.toISOString(),
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Pending changes to approved cars, oldest first. */
  async listRevisions(page: number, pageSize: number): Promise<Page<ConsoleRevisionSummary>> {
    const where = { status: CarRevisionStatus.PENDING } as const;
    const [revisions, total] = await Promise.all([
      this.prisma.carRevision.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          model: modelWithMake,
          documents: { select: { type: true }, orderBy: { type: 'asc' } },
          car: {
            select: {
              id: true,
              status: true,
              year: true,
              licensePlate: true,
              model: modelWithMake,
              owner: userRef,
            },
          },
        },
      }),
      this.prisma.carRevision.count({ where }),
    ]);
    return {
      items: revisions.map((revision) => ({
        id: revision.id,
        car: {
          id: revision.car.id,
          status: revision.car.status,
          make: revision.car.model.make,
          model: { id: revision.car.model.id, name: revision.car.model.name },
          year: revision.car.year,
          licensePlate: revision.car.licensePlate,
        },
        changes: {
          make: revision.model?.make ?? null,
          model: revision.model ? { id: revision.model.id, name: revision.model.name } : null,
          year: revision.year,
          licensePlate: revision.licensePlate,
          documentTypes: revision.documents.map((d) => d.type),
        },
        owner: revision.car.owner,
        createdAt: revision.createdAt.toISOString(),
        updatedAt: revision.updatedAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }

  /** The full car with its documents (presigned, 5 minutes) and any pending changes. */
  async get(carId: string): Promise<ConsoleCar> {
    const car = await this.prisma.car.findUnique({
      where: { id: carId },
      include: CONSOLE_CAR_INCLUDE,
    });
    if (!car) throw carNotFound();
    return {
      ...(await toOwnerCar(this.uploads, car)),
      owner: car.owner,
      reviewedAt: car.reviewedAt?.toISOString() ?? null,
      reviewedBy: car.reviewedBy,
    };
  }

  /**
   * Lists a car waiting for its first review. What it was submitted with is checked again,
   * since the owner can still edit it while it waits.
   */
  async approve(adminId: string, carId: string): Promise<ConsoleCar> {
    const car = await this.prisma.$transaction(async (tx) => {
      const locked = await lockCar(tx, carId);
      if (locked.status !== CarStatus.PENDING_REVIEW) {
        throw statusConflict('Xe không ở trạng thái chờ duyệt.');
      }
      const [photoCount, pricing, documents] = await Promise.all([
        tx.carPhoto.count({ where: { carId } }),
        tx.carPricing.findUnique({ where: { carId }, select: { carId: true } }),
        tx.carDocument.findMany({
          where: { carId, revisionId: null },
          select: { type: true, expiresOn: true },
        }),
      ]);
      const missing = missingForSubmission({
        photoCount,
        hasPricing: pricing !== null,
        documents: documents.map((d) => ({
          type: d.type,
          expiresOn: d.expiresOn ? toDateOnly(d.expiresOn) : null,
        })),
      });
      if (missing.length > 0) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          ErrorCode.CAR_INCOMPLETE,
          'Xe không còn đủ điều kiện để duyệt. Hãy từ chối kèm lý do để chủ xe bổ sung.',
          missing,
        );
      }
      await tx.car.update({
        where: { id: carId },
        data: {
          status: CarStatus.ACTIVE,
          rejectionReason: null,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
      return locked;
    });
    await this.notify(car, 'car.approved', {});
    return this.get(carId);
  }

  async reject(adminId: string, carId: string, reason: string): Promise<ConsoleCar> {
    const car = await this.prisma.$transaction(async (tx) => {
      const locked = await lockCar(tx, carId);
      if (locked.status !== CarStatus.PENDING_REVIEW) {
        throw statusConflict('Xe không ở trạng thái chờ duyệt.');
      }
      await tx.car.update({
        where: { id: carId },
        data: {
          status: CarStatus.REJECTED,
          rejectionReason: reason,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
      return locked;
    });
    await this.notify(car, 'car.rejected', { reason });
    return this.get(carId);
  }

  /**
   * Applies the pending changes: plate, model, year and the new documents, which replace
   * the current ones of the same type.
   */
  async approveRevision(adminId: string, carId: string): Promise<ConsoleCar> {
    let result: { car: LockedCar; replaced: string[] };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const car = await lockCar(tx, carId);
        const revision = await findPendingRevision(tx, carId);
        const types = revision.documents.map((d) => d.type);
        const replaced = await tx.carDocument.findMany({
          where: { carId, revisionId: null, type: { in: types } },
          select: { id: true, fileKey: true },
        });
        await tx.carDocument.deleteMany({ where: { id: { in: replaced.map((d) => d.id) } } });
        await tx.carDocument.updateMany({
          where: { revisionId: revision.id },
          data: { revisionId: null },
        });
        await tx.carRevision.update({
          where: { id: revision.id },
          data: {
            status: CarRevisionStatus.APPROVED,
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        });
        await tx.car.update({
          where: { id: carId },
          data: {
            ...(revision.modelId !== null && { modelId: revision.modelId }),
            ...(revision.year !== null && { year: revision.year }),
            ...(revision.licensePlate !== null && { licensePlate: revision.licensePlate }),
            updatedAt: new Date(),
          },
        });
        return { car, replaced: replaced.map((d) => d.fileKey) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.LICENSE_PLATE_TAKEN,
          'Biển số mới đã thuộc về một xe khác.',
        );
      }
      throw error;
    }
    await this.removeDocuments(result.replaced);
    await this.notify(result.car, 'car.revision-approved', {});
    return this.get(carId);
  }

  /** Drops the pending changes; the car keeps its data and the owner sees the reason. */
  async rejectRevision(adminId: string, carId: string, reason: string): Promise<ConsoleCar> {
    const { car, files } = await this.prisma.$transaction(async (tx) => {
      const locked = await lockCar(tx, carId);
      const revision = await findPendingRevision(tx, carId);
      await tx.carDocument.deleteMany({ where: { revisionId: revision.id } });
      await tx.carRevision.update({
        where: { id: revision.id },
        data: {
          status: CarRevisionStatus.REJECTED,
          rejectionReason: reason,
          reviewedById: adminId,
          reviewedAt: new Date(),
        },
      });
      await tx.car.update({ where: { id: carId }, data: { updatedAt: new Date() } });
      return { car: locked, files: revision.documents.map((d) => d.fileKey) };
    });
    await this.removeDocuments(files);
    await this.notify(car, 'car.revision-rejected', { reason });
    return this.get(carId);
  }

  /** Takes a listed car out of search until an admin shows it again. */
  async hide(carId: string, reason: string): Promise<ConsoleCar> {
    const car = await this.prisma.$transaction(async (tx) => {
      const locked = await lockCar(tx, carId);
      if (locked.status !== CarStatus.ACTIVE && locked.status !== CarStatus.PAUSED) {
        throw statusConflict('Chỉ ẩn được xe đang hiển thị hoặc đang tạm ngưng.');
      }
      await tx.car.update({
        where: { id: carId },
        data: { status: CarStatus.HIDDEN, rejectionReason: reason },
      });
      return locked;
    });
    await this.notify(car, 'car.hidden', { reason });
    return this.get(carId);
  }

  /** [Đề xuất] A hidden car comes back as listed; the owner can pause it again. */
  async unhide(carId: string): Promise<ConsoleCar> {
    const car = await this.prisma.$transaction(async (tx) => {
      const locked = await lockCar(tx, carId);
      if (locked.status !== CarStatus.HIDDEN) throw statusConflict('Xe không bị ẩn.');
      await tx.car.update({
        where: { id: carId },
        data: { status: CarStatus.ACTIVE, rejectionReason: null },
      });
      return locked;
    });
    await this.notify(car, 'car.unhidden', {});
    return this.get(carId);
  }

  /**
   * Takes an approved car down for good (decided 2026-11-14): it cannot come back and the
   * owner can no longer edit it. Pending changes are dropped; confirmed trips are kept.
   */
  async remove(carId: string, reason: string): Promise<ConsoleCar> {
    const { car, files } = await this.prisma.$transaction(async (tx) => {
      const locked = await lockCar(tx, carId);
      if (!LISTED.has(locked.status)) {
        throw statusConflict(
          'Chỉ gỡ được xe đã được duyệt. Xe đang chờ duyệt thì hãy từ chối kèm lý do.',
        );
      }
      const pending = await tx.carRevision.findMany({
        where: { carId, status: CarRevisionStatus.PENDING },
        select: { id: true, documents: { select: { fileKey: true } } },
      });
      await tx.carRevision.deleteMany({ where: { id: { in: pending.map((r) => r.id) } } });
      await tx.car.update({
        where: { id: carId },
        data: { status: CarStatus.REMOVED, rejectionReason: reason },
      });
      return { car: locked, files: pending.flatMap((r) => r.documents.map((d) => d.fileKey)) };
    });
    await this.removeDocuments(files);
    await this.notify(car, 'car.removed', { reason });
    return this.get(carId);
  }

  /**
   * Emails the owner after the decision is saved. A failure to queue the email is logged
   * and does not undo the decision.
   */
  private async notify<N extends Extract<EmailTemplateName, `car.${string}`>>(
    car: LockedCar,
    template: N,
    extra: Omit<EmailData<N>, 'fullName' | 'carId' | 'carName'>,
  ) {
    try {
      const details = await this.prisma.car.findUniqueOrThrow({
        where: { id: car.id },
        select: {
          year: true,
          licensePlate: true,
          model: modelWithMake,
          owner: { select: { id: true, email: true, fullName: true } },
        },
      });
      const carName = `${details.model.make.name} ${details.model.name} ${details.year} (${details.licensePlate})`;
      await this.mail.send(template, {
        to: details.owner.email,
        userId: details.owner.id,
        // TypeScript cannot see that `extra` plus the shared fields is the full data.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        data: {
          ...extra,
          fullName: details.owner.fullName,
          carId: car.id,
          carName,
        } as EmailData<N>,
      });
    } catch (error) {
      this.logger.error(`Could not email ${template} for car ${car.id}: ${String(error)}`);
    }
  }

  /** Storage cleanup after the DB change committed; a failure only leaves an orphan file. */
  private async removeDocuments(keys: string[]) {
    await Promise.all(
      keys.map((key) =>
        this.uploads.remove('CAR_DOCUMENT', key).catch((error: unknown) => {
          this.logger.warn(`Could not delete CAR_DOCUMENT ${key}: ${String(error)}`);
        }),
      ),
    );
  }
}

/** Locks the car row for the rest of the transaction, so two admins cannot race. */
async function lockCar(tx: Tx, carId: string): Promise<LockedCar> {
  const rows = await tx.$queryRaw<{ id: string; status: CarStatus; owner_id: string }[]>`
    SELECT id, status::text AS status, owner_id
    FROM cars
    WHERE id = ${carId}::uuid
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw carNotFound();
  return { id: row.id, status: row.status, ownerId: row.owner_id };
}

async function findPendingRevision(tx: Tx, carId: string) {
  const revision = await tx.carRevision.findFirst({
    where: { carId, status: CarRevisionStatus.PENDING },
    include: { documents: { select: { type: true, fileKey: true } } },
  });
  if (!revision) {
    throw new AppException(
      HttpStatus.NOT_FOUND,
      ErrorCode.NOT_FOUND,
      'Xe không có thay đổi nào đang chờ duyệt.',
    );
  }
  return revision;
}
