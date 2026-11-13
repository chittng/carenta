import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import {
  type ApiErrorDetail,
  CAR_PHOTO_MAX,
  CAR_PHOTO_MIN,
  type CarDelivery,
  type CarLocation,
  type CarPricingInput,
  CarDocumentType,
  type CarRules,
  CarRevisionStatus,
  type CarStatus,
  type CreateCarInput,
  ErrorCode,
  type MileageLimit,
  type OwnerCar,
  type OwnerCarSummary,
  type PutCarDocumentInput,
  type ReorderCarPhotosInput,
  type UpdateCarInput,
} from '@carenta/shared';

import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../storage/uploads.service.js';
import {
  OWNER_CAR_INCLUDE,
  OWNER_CAR_SUMMARY_SELECT,
  toOwnerCar,
  toOwnerCarSummary,
} from './cars.mapper.js';
import {
  canDelete,
  canSubmit,
  editMode,
  enforcesPhotoMinimum,
  missingForSubmission,
  pausedStatus,
  resumedStatus,
} from './cars.policy.js';

type Tx = Prisma.TransactionClient;

/** Fields an admin must review again once the car has been approved (spec §12.3). */
interface ReviewedFields {
  modelId?: number;
  year?: number;
  licensePlate?: string;
}

const carNotFound = () =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Không tìm thấy xe.');

const plateTaken = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.LICENSE_PLATE_TAKEN,
    'Biển số này đã được đăng trên Carenta. Nếu đây là xe của bạn, vui lòng liên hệ hỗ trợ.',
  );

const carRemoved = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.CAR_STATUS_CONFLICT,
    'Xe đã bị gỡ khỏi Carenta nên không thể chỉnh sửa.',
  );

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/**
 * Cars as managed by their owner (spec §4.1–4.6, §12.3). Every method takes the caller's id
 * and answers 404 for cars they do not own, so ids of other cars are not leaked.
 * Admin review lives in Console (CARENTA-15).
 */
@Injectable()
export class CarsService {
  private readonly logger = new Logger(CarsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UploadsService) private readonly uploads: UploadsService,
  ) {}

  async list(ownerId: string): Promise<OwnerCarSummary[]> {
    const cars = await this.prisma.car.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: OWNER_CAR_SUMMARY_SELECT,
    });
    return cars.map((car) => toOwnerCarSummary(this.uploads, car));
  }

  async get(ownerId: string, carId: string): Promise<OwnerCar> {
    const car = await this.prisma.car.findFirst({
      where: { id: carId, ownerId },
      include: OWNER_CAR_INCLUDE,
    });
    if (!car) throw carNotFound();
    return toOwnerCar(this.uploads, car);
  }

  /** Saves a new car as a draft. */
  async create(ownerId: string, input: CreateCarInput): Promise<OwnerCar> {
    let carId: string;
    try {
      carId = await this.prisma.$transaction(async (tx) => {
        await assertModel(tx, input.modelId);
        await assertAmenities(tx, input.amenityIds ?? []);
        await assertPlateFree(tx, input.licensePlate, null);
        const car = await tx.car.create({
          data: {
            ownerId,
            modelId: input.modelId,
            year: input.year,
            licensePlate: input.licensePlate,
            color: input.color,
            bodyType: input.bodyType,
            seats: input.seats,
            transmission: input.transmission,
            fuelType: input.fuelType,
            fuelConsumption: input.fuelConsumption ?? null,
            odometerKm: input.odometerKm,
            description: input.description ?? null,
            ...(input.rules && rulesData(input.rules)),
            ...mileageData(input.mileageLimit ?? null),
            ...locationData(input.location),
            instantBook: input.instantBook,
            depositAmount: input.depositAmount,
            bufferMinutes: input.bufferMinutes,
            ...(input.delivery !== undefined && deliveryData(input.delivery)),
            amenities: { create: (input.amenityIds ?? []).map((amenityId) => ({ amenityId })) },
          },
          select: { id: true },
        });
        return car.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw plateTaken();
      throw error;
    }
    return this.get(ownerId, carId);
  }

  /**
   * Applies an edit. On an approved car the reviewed fields (plate, model, year) go into the
   * pending revision, overwriting what it held; a value equal to the car's current one drops
   * that change, and an empty revision is deleted. The car keeps showing its current data.
   */
  async update(ownerId: string, carId: string, input: UpdateCarInput): Promise<OwnerCar> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const car = await lockOwnedCar(tx, carId, ownerId);
        const mode = editMode(car.status);
        if (mode === 'locked') throw carRemoved();

        if (input.modelId !== undefined) await assertModel(tx, input.modelId);
        if (input.amenityIds !== undefined) await assertAmenities(tx, input.amenityIds);
        if (input.licensePlate !== undefined && input.licensePlate !== car.licensePlate) {
          await assertPlateFree(tx, input.licensePlate, carId);
        }

        const reviewed: ReviewedFields = {
          modelId: input.modelId,
          year: input.year,
          licensePlate: input.licensePlate,
        };
        if (mode === 'revision') {
          await this.mergeIntoRevision(tx, car, reviewed);
        }

        await tx.car.update({
          where: { id: carId },
          // Always runs, so updatedAt moves even when only the revision or amenities changed.
          data: { ...(mode === 'direct' ? reviewed : {}), ...detailsData(input) },
        });

        if (input.amenityIds !== undefined) {
          await tx.carAmenity.deleteMany({ where: { carId } });
          await tx.carAmenity.createMany({
            data: input.amenityIds.map((amenityId) => ({ carId, amenityId })),
          });
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw plateTaken();
      throw error;
    }
    return this.get(ownerId, carId);
  }

  /** Deletes a car that was never approved, with its files. Listed cars can only be paused. */
  async remove(ownerId: string, carId: string): Promise<void> {
    const files = await this.prisma.$transaction(async (tx) => {
      const car = await lockOwnedCar(tx, carId, ownerId);
      if (!canDelete(car.status)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.CAR_STATUS_CONFLICT,
          'Chỉ xoá được xe chưa từng được duyệt. Với xe đã đăng, bạn có thể tạm ngưng cho thuê.',
        );
      }
      const [photos, documents] = await Promise.all([
        tx.carPhoto.findMany({ where: { carId }, select: { fileKey: true } }),
        tx.carDocument.findMany({ where: { carId }, select: { fileKey: true } }),
      ]);
      await tx.car.delete({ where: { id: carId } });
      return { photos: photos.map((p) => p.fileKey), documents: documents.map((d) => d.fileKey) };
    });
    await this.removeFiles('CAR_PHOTO', files.photos);
    await this.removeFiles('CAR_DOCUMENT', files.documents);
  }

  /** Sends a draft (or a rejected car) to the admin review queue. */
  async submit(ownerId: string, carId: string): Promise<OwnerCar> {
    await this.prisma.$transaction(async (tx) => {
      const car = await lockOwnedCar(tx, carId, ownerId);
      if (!canSubmit(car.status)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.CAR_STATUS_CONFLICT,
          'Xe đã được gửi duyệt hoặc đã được duyệt.',
        );
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
          'Xe còn thiếu thông tin để gửi duyệt.',
          missing,
        );
      }
      await tx.car.update({
        where: { id: carId },
        data: { status: 'PENDING_REVIEW', submittedAt: new Date(), rejectionReason: null },
      });
    });
    return this.get(ownerId, carId);
  }

  pause(ownerId: string, carId: string): Promise<OwnerCar> {
    return this.transition(ownerId, carId, pausedStatus, 'Chỉ tạm ngưng được xe đang hiển thị.');
  }

  resume(ownerId: string, carId: string): Promise<OwnerCar> {
    return this.transition(ownerId, carId, resumedStatus, 'Xe không ở trạng thái tạm ngưng.');
  }

  /** Adds a photo at the end. The upload is validated and resized before anything is saved. */
  async addPhoto(ownerId: string, carId: string, uploadKey: string): Promise<OwnerCar> {
    // Fail fast before processing the image; checked again under the lock below.
    const before = await this.prisma.car.findFirst({
      where: { id: carId, ownerId },
      select: { status: true, _count: { select: { photos: true } } },
    });
    if (!before) throw carNotFound();
    if (editMode(before.status) === 'locked') throw carRemoved();
    if (before._count.photos >= CAR_PHOTO_MAX) throw tooManyPhotos();

    const fileKey = await this.uploads.claim(ownerId, 'CAR_PHOTO', uploadKey);
    try {
      await this.prisma.$transaction(async (tx) => {
        const car = await lockOwnedCar(tx, carId, ownerId);
        if (editMode(car.status) === 'locked') throw carRemoved();
        const count = await tx.carPhoto.count({ where: { carId } });
        if (count >= CAR_PHOTO_MAX) throw tooManyPhotos();
        await tx.carPhoto.create({ data: { carId, fileKey, position: count } });
        await touch(tx, carId);
      });
    } catch (error) {
      await this.removeFiles('CAR_PHOTO', [fileKey]);
      throw error;
    }
    return this.get(ownerId, carId);
  }

  async removePhoto(ownerId: string, carId: string, photoId: string): Promise<OwnerCar> {
    const fileKey = await this.prisma.$transaction(async (tx) => {
      const car = await lockOwnedCar(tx, carId, ownerId);
      if (editMode(car.status) === 'locked') throw carRemoved();
      const photos = await tx.carPhoto.findMany({
        where: { carId },
        orderBy: { position: 'asc' },
        select: { id: true, fileKey: true },
      });
      const photo = photos.find((p) => p.id === photoId);
      if (!photo) {
        throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Không tìm thấy ảnh.');
      }
      if (enforcesPhotoMinimum(car.status) && photos.length <= CAR_PHOTO_MIN) {
        throw new AppException(
          HttpStatus.CONFLICT,
          ErrorCode.CAR_PHOTO_LIMIT,
          `Xe đang đăng cần ít nhất ${CAR_PHOTO_MIN} ảnh. Hãy thêm ảnh mới trước khi xoá ảnh này.`,
        );
      }
      await tx.carPhoto.delete({ where: { id: photoId } });
      await setPhotoOrder(
        tx,
        photos.filter((p) => p.id !== photoId).map((p) => p.id),
      );
      await touch(tx, carId);
      return photo.fileKey;
    });
    await this.removeFiles('CAR_PHOTO', [fileKey]);
    return this.get(ownerId, carId);
  }

  /** Sets the display order of all photos; the first becomes the cover. */
  async reorderPhotos(
    ownerId: string,
    carId: string,
    input: ReorderCarPhotosInput,
  ): Promise<OwnerCar> {
    await this.prisma.$transaction(async (tx) => {
      const car = await lockOwnedCar(tx, carId, ownerId);
      if (editMode(car.status) === 'locked') throw carRemoved();
      const photos = await tx.carPhoto.findMany({ where: { carId }, select: { id: true } });
      const current = new Set(photos.map((p) => p.id));
      if (input.photoIds.length !== current.size || input.photoIds.some((id) => !current.has(id))) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.VALIDATION_FAILED,
          'Danh sách ảnh không khớp với ảnh hiện có của xe. Vui lòng tải lại trang.',
          [{ path: 'photoIds', message: 'Phải gồm đúng tất cả ảnh của xe.' }],
        );
      }
      await setPhotoOrder(tx, input.photoIds);
      await touch(tx, carId);
    });
    return this.get(ownerId, carId);
  }

  /**
   * Uploads the registration or inspection document. Before approval it replaces the current
   * one; on an approved car it goes into the pending revision for an admin to review.
   */
  async putDocument(
    ownerId: string,
    carId: string,
    type: CarDocumentType,
    input: PutCarDocumentInput,
  ): Promise<OwnerCar> {
    if (type === CarDocumentType.INSPECTION && input.expiresOn === undefined) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_FAILED,
        'Vui lòng nhập ngày hết hạn đăng kiểm.',
        [{ path: 'expiresOn', message: 'Vui lòng nhập ngày hết hạn đăng kiểm.' }],
      );
    }
    const expiresOn =
      type === CarDocumentType.INSPECTION && input.expiresOn ? fromDateOnly(input.expiresOn) : null;

    const before = await this.prisma.car.findFirst({
      where: { id: carId, ownerId },
      select: { status: true },
    });
    if (!before) throw carNotFound();
    if (editMode(before.status) === 'locked') throw carRemoved();

    const fileKey = await this.uploads.claim(ownerId, 'CAR_DOCUMENT', input.uploadKey);
    let replaced: string[];
    try {
      replaced = await this.prisma.$transaction(async (tx) => {
        const car = await lockOwnedCar(tx, carId, ownerId);
        const mode = editMode(car.status);
        if (mode === 'locked') throw carRemoved();

        const revisionId = mode === 'revision' ? await ensurePendingRevision(tx, carId) : null;
        const old = await tx.carDocument.findMany({
          where: { carId, type, revisionId },
          select: { id: true, fileKey: true },
        });
        await tx.carDocument.deleteMany({ where: { id: { in: old.map((d) => d.id) } } });
        await tx.carDocument.create({ data: { carId, revisionId, type, fileKey, expiresOn } });
        await touch(tx, carId);
        return old.map((d) => d.fileKey);
      });
    } catch (error) {
      await this.removeFiles('CAR_DOCUMENT', [fileKey]);
      throw error;
    }
    await this.removeFiles('CAR_DOCUMENT', replaced);
    return this.get(ownerId, carId);
  }

  /**
   * Sets the price list (spec §4.2), replacing the previous one. Prices never need another
   * review (spec §12.3) and bookings already made keep the prices they were made with.
   */
  async putPricing(ownerId: string, carId: string, input: CarPricingInput): Promise<OwnerCar> {
    await this.prisma.$transaction(async (tx) => {
      const car = await lockOwnedCar(tx, carId, ownerId);
      if (editMode(car.status) === 'locked') throw carRemoved();
      await tx.carPricing.upsert({
        where: { carId },
        create: { carId, ...input },
        update: input,
      });
      await touch(tx, carId);
    });
    return this.get(ownerId, carId);
  }

  /** Withdraws the changes waiting for review; the car keeps its current data. */
  async cancelRevision(ownerId: string, carId: string): Promise<OwnerCar> {
    const files = await this.prisma.$transaction(async (tx) => {
      await lockOwnedCar(tx, carId, ownerId);
      const revision = await tx.carRevision.findFirst({
        where: { carId, status: CarRevisionStatus.PENDING },
        select: { id: true, documents: { select: { fileKey: true } } },
      });
      if (!revision) {
        throw new AppException(
          HttpStatus.NOT_FOUND,
          ErrorCode.NOT_FOUND,
          'Xe không có thay đổi nào đang chờ duyệt.',
        );
      }
      await tx.carRevision.delete({ where: { id: revision.id } });
      await touch(tx, carId);
      return revision.documents.map((d) => d.fileKey);
    });
    await this.removeFiles('CAR_DOCUMENT', files);
    return this.get(ownerId, carId);
  }

  private async transition(
    ownerId: string,
    carId: string,
    next: (status: CarStatus) => CarStatus | null,
    conflictMessage: string,
  ): Promise<OwnerCar> {
    await this.prisma.$transaction(async (tx) => {
      const car = await lockOwnedCar(tx, carId, ownerId);
      const status = next(car.status);
      if (!status) {
        throw new AppException(HttpStatus.CONFLICT, ErrorCode.CAR_STATUS_CONFLICT, conflictMessage);
      }
      await tx.car.update({ where: { id: carId }, data: { status } });
    });
    return this.get(ownerId, carId);
  }

  private async mergeIntoRevision(tx: Tx, car: LockedCar, changes: ReviewedFields) {
    const provided = Object.values(changes).some((value) => value !== undefined);
    if (!provided) return;

    const existing = await findPendingRevision(tx, car.id);
    const merged = {
      modelId: diff(changes.modelId, car.modelId, existing?.modelId ?? null),
      year: diff(changes.year, car.year, existing?.year ?? null),
      licensePlate: diff(changes.licensePlate, car.licensePlate, existing?.licensePlate ?? null),
    };
    const hasChanges =
      Object.values(merged).some((value) => value !== null) ||
      (existing?._count.documents ?? 0) > 0;

    if (!hasChanges) {
      if (existing) await tx.carRevision.delete({ where: { id: existing.id } });
      return;
    }
    if (existing) {
      await tx.carRevision.update({ where: { id: existing.id }, data: merged });
    } else {
      await tx.carRevision.create({ data: { carId: car.id, ...merged } });
    }
  }

  /** Storage cleanup after the DB change committed; a failure only leaves an orphan file. */
  private async removeFiles(purpose: 'CAR_PHOTO' | 'CAR_DOCUMENT', keys: string[]) {
    await Promise.all(
      keys.map((key) =>
        this.uploads.remove(purpose, key).catch((error: unknown) => {
          this.logger.warn(`Could not delete ${purpose} ${key}: ${String(error)}`);
        }),
      ),
    );
  }
}

const REVISION_FIELDS = {
  id: true,
  modelId: true,
  year: true,
  licensePlate: true,
  _count: { select: { documents: true } },
} as const satisfies Prisma.CarRevisionSelect;

const findPendingRevision = (tx: Tx, carId: string) =>
  tx.carRevision.findFirst({
    where: { carId, status: CarRevisionStatus.PENDING },
    select: REVISION_FIELDS,
  });

/** Id of the car's pending revision, created empty if there is none. */
async function ensurePendingRevision(tx: Tx, carId: string): Promise<string> {
  const existing = await findPendingRevision(tx, carId);
  if (existing) return existing.id;
  const created = await tx.carRevision.create({ data: { carId }, select: { id: true } });
  return created.id;
}

/**
 * The value a revision should hold for one reviewed field: the requested value, or null
 * when it equals the car's current value (the change was undone). Not provided: unchanged.
 */
function diff<T>(requested: T | undefined, current: T, pending: T | null): T | null {
  if (requested === undefined) return pending;
  return requested === current ? null : requested;
}

const tooManyPhotos = () =>
  new AppException(
    HttpStatus.CONFLICT,
    ErrorCode.CAR_PHOTO_LIMIT,
    `Mỗi xe có tối đa ${CAR_PHOTO_MAX} ảnh.`,
  );

interface LockedCar {
  id: string;
  status: CarStatus;
  modelId: number;
  year: number;
  licensePlate: string;
}

/**
 * Locks the car row for the rest of the transaction, so concurrent edits (two photo uploads,
 * an edit racing a submit) apply one after another. 404 when the caller does not own it.
 */
async function lockOwnedCar(tx: Tx, carId: string, ownerId: string): Promise<LockedCar> {
  const rows = await tx.$queryRaw<
    { id: string; status: CarStatus; model_id: number; year: number; license_plate: string }[]
  >`
    SELECT id, status::text AS status, model_id, year, license_plate
    FROM cars
    WHERE id = ${carId}::uuid AND owner_id = ${ownerId}::uuid
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw carNotFound();
  return {
    id: row.id,
    status: row.status,
    modelId: row.model_id,
    year: row.year,
    licensePlate: row.license_plate,
  };
}

const touch = (tx: Tx, carId: string) =>
  tx.car.update({ where: { id: carId }, data: { updatedAt: new Date() } });

async function setPhotoOrder(tx: Tx, photoIds: string[]) {
  await Promise.all(
    photoIds.map((id, position) => tx.carPhoto.update({ where: { id }, data: { position } })),
  );
}

async function assertModel(tx: Tx, modelId: number) {
  const model = await tx.carModel.findFirst({
    where: { id: modelId, isActive: true, make: { isActive: true } },
    select: { id: true },
  });
  if (!model) {
    throw catalogItemNotFound([{ path: 'modelId', message: 'Dòng xe không có trong danh mục.' }]);
  }
}

async function assertAmenities(tx: Tx, amenityIds: number[]) {
  if (amenityIds.length === 0) return;
  const found = await tx.amenity.findMany({
    where: { id: { in: amenityIds }, isActive: true },
    select: { id: true },
  });
  const known = new Set(found.map((a) => a.id));
  const details = amenityIds.flatMap((id, index) =>
    known.has(id)
      ? []
      : [{ path: `amenityIds.${index}`, message: 'Tiện nghi không có trong danh mục.' }],
  );
  if (details.length > 0) throw catalogItemNotFound(details);
}

const catalogItemNotFound = (details: ApiErrorDetail[]) =>
  new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ErrorCode.CATALOG_ITEM_NOT_FOUND,
    'Thông tin xe có mục không có trong danh mục. Vui lòng chọn lại.',
    details,
  );

/**
 * A plate must not belong to another car or be requested by another car's pending revision.
 * The unique indexes on both tables back this up against races.
 */
async function assertPlateFree(tx: Tx, licensePlate: string, carId: string | null) {
  const [car, revision] = await Promise.all([
    tx.car.findFirst({
      where: { licensePlate, ...(carId ? { id: { not: carId } } : {}) },
      select: { id: true },
    }),
    tx.carRevision.findFirst({
      where: {
        licensePlate,
        status: CarRevisionStatus.PENDING,
        ...(carId ? { carId: { not: carId } } : {}),
      },
      select: { id: true },
    }),
  ]);
  if (car || revision) throw plateTaken();
}

/** Columns for everything except the reviewed fields (model, year, plate). */
function detailsData(input: UpdateCarInput) {
  return {
    color: input.color,
    bodyType: input.bodyType,
    seats: input.seats,
    transmission: input.transmission,
    fuelType: input.fuelType,
    fuelConsumption: input.fuelConsumption,
    odometerKm: input.odometerKm,
    description: input.description,
    ...(input.rules && rulesData(input.rules)),
    ...(input.mileageLimit !== undefined && mileageData(input.mileageLimit)),
    ...(input.location && locationData(input.location)),
    instantBook: input.instantBook,
    depositAmount: input.depositAmount,
    bufferMinutes: input.bufferMinutes,
    ...(input.delivery !== undefined && deliveryData(input.delivery)),
  };
}

function deliveryData(delivery: CarDelivery | null) {
  return {
    deliveryEnabled: delivery !== null,
    deliveryMaxRadiusKm: delivery?.maxRadiusKm ?? null,
    deliveryFeePerKm: delivery?.feePerKm ?? null,
    deliveryFreeRadiusKm: delivery?.freeRadiusKm ?? null,
  };
}

function rulesData(rules: CarRules) {
  return {
    ruleNoSmoking: rules.noSmoking,
    ruleNoPets: rules.noPets,
    ruleNoDurianSeafood: rules.noDurianSeafood,
    ruleSameFuelLevel: rules.sameFuelLevel,
    ruleKeepClean: rules.keepClean,
    rulesNote: rules.note,
  };
}

function mileageData(limit: MileageLimit | null) {
  return { dailyKmLimit: limit?.dailyKm ?? null, extraKmFee: limit?.extraFeePerKm ?? null };
}

function locationData(location: CarLocation) {
  return {
    province: location.province,
    ward: location.ward,
    addressLine: location.addressLine,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}
