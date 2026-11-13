import {
  type CarDocument as CarDocumentDto,
  CarRevisionStatus,
  type OwnerCar,
  type OwnerCarSummary,
} from '@carenta/shared';

import { type Prisma } from '../generated/prisma/client.js';
import { type UploadsService } from '../storage/uploads.service.js';

const catalogRef = { select: { id: true, name: true } } as const;
const modelWithMake = {
  select: { id: true, name: true, make: catalogRef },
} as const;

/** Everything `toOwnerCar` reads. */
export const OWNER_CAR_INCLUDE = {
  model: modelWithMake,
  amenities: {
    select: { amenity: { select: { id: true, code: true, name: true, sortOrder: true } } },
  },
  photos: { orderBy: { position: 'asc' } },
  documents: { where: { revisionId: null }, orderBy: { type: 'asc' } },
  // The latest revision: shown while pending, or until the next edit if it was rejected.
  revisions: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { model: modelWithMake, documents: { orderBy: { type: 'asc' } } },
  },
} as const satisfies Prisma.CarInclude;

export type OwnerCarRecord = Prisma.CarGetPayload<{ include: typeof OWNER_CAR_INCLUDE }>;

export const OWNER_CAR_SUMMARY_SELECT = {
  id: true,
  status: true,
  year: true,
  licensePlate: true,
  createdAt: true,
  updatedAt: true,
  model: modelWithMake,
  photos: { orderBy: { position: 'asc' }, take: 1, select: { fileKey: true } },
  revisions: { where: { status: CarRevisionStatus.PENDING }, select: { id: true } },
  _count: { select: { photos: true } },
} as const satisfies Prisma.CarSelect;

export type OwnerCarSummaryRecord = Prisma.CarGetPayload<{
  select: typeof OWNER_CAR_SUMMARY_SELECT;
}>;

/** `@db.Date` columns come back as midnight UTC. */
export const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
export const fromDateOnly = (date: string) => new Date(`${date}T00:00:00.000Z`);

type DocumentRecord = OwnerCarRecord['documents'][number];

async function toDocument(uploads: UploadsService, doc: DocumentRecord): Promise<CarDocumentDto> {
  return {
    id: doc.id,
    type: doc.type,
    expiresOn: doc.expiresOn ? toDateOnly(doc.expiresOn) : null,
    url: await uploads.privateUrl('CAR_DOCUMENT', doc.fileKey),
  };
}

/** The owner's view of a car. Only call after checking the caller owns it. */
export async function toOwnerCar(uploads: UploadsService, car: OwnerCarRecord): Promise<OwnerCar> {
  const latest = car.revisions[0];
  const revision = latest && latest.status !== CarRevisionStatus.APPROVED ? latest : null;

  return {
    id: car.id,
    status: car.status,
    rejectionReason: car.rejectionReason,
    submittedAt: car.submittedAt?.toISOString() ?? null,
    make: car.model.make,
    model: { id: car.model.id, name: car.model.name },
    year: car.year,
    licensePlate: car.licensePlate,
    color: car.color,
    bodyType: car.bodyType,
    seats: car.seats,
    transmission: car.transmission,
    fuelType: car.fuelType,
    fuelConsumption: car.fuelConsumption?.toNumber() ?? null,
    odometerKm: car.odometerKm,
    description: car.description,
    rules: {
      noSmoking: car.ruleNoSmoking,
      noPets: car.ruleNoPets,
      noDurianSeafood: car.ruleNoDurianSeafood,
      sameFuelLevel: car.ruleSameFuelLevel,
      keepClean: car.ruleKeepClean,
      note: car.rulesNote,
    },
    mileageLimit:
      car.dailyKmLimit !== null && car.extraKmFee !== null
        ? { dailyKm: car.dailyKmLimit, extraFeePerKm: car.extraKmFee }
        : null,
    location: {
      province: car.province,
      ward: car.ward,
      addressLine: car.addressLine,
      latitude: car.latitude.toNumber(),
      longitude: car.longitude.toNumber(),
    },
    amenities: car.amenities
      .map(({ amenity }) => amenity)
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .map(({ id, code, name }) => ({ id, code, name })),
    photos: car.photos.map((photo) => ({
      id: photo.id,
      position: photo.position,
      urls: uploads.carPhotoUrls(photo.fileKey),
    })),
    documents: await Promise.all(car.documents.map((doc) => toDocument(uploads, doc))),
    revision: revision && {
      id: revision.id,
      status: revision.status,
      make: revision.model?.make ?? null,
      model: revision.model ? { id: revision.model.id, name: revision.model.name } : null,
      year: revision.year,
      licensePlate: revision.licensePlate,
      documents: await Promise.all(revision.documents.map((doc) => toDocument(uploads, doc))),
      rejectionReason: revision.rejectionReason,
      createdAt: revision.createdAt.toISOString(),
      updatedAt: revision.updatedAt.toISOString(),
    },
    createdAt: car.createdAt.toISOString(),
    updatedAt: car.updatedAt.toISOString(),
  };
}

export function toOwnerCarSummary(
  uploads: UploadsService,
  car: OwnerCarSummaryRecord,
): OwnerCarSummary {
  const cover = car.photos[0];
  return {
    id: car.id,
    status: car.status,
    make: car.model.make,
    model: { id: car.model.id, name: car.model.name },
    year: car.year,
    licensePlate: car.licensePlate,
    coverPhoto: cover ? uploads.carPhotoUrls(cover.fileKey) : null,
    photoCount: car._count.photos,
    hasPendingRevision: car.revisions.length > 0,
    createdAt: car.createdAt.toISOString(),
    updatedAt: car.updatedAt.toISOString(),
  };
}
