import { z } from 'zod';

import {
  carDeliveryViewSchema,
  carPricingViewSchema,
  rentalSettingsFields,
} from './rental-terms.js';
import { vietnamDate, vietnamYear } from './time.js';

// ─── Rules (spec §4.1, §12.3) ───────────────────────────────────────────────

/** A car needs at least this many photos to be submitted and to stay listed. */
export const CAR_PHOTO_MIN = 4;
export const CAR_PHOTO_MAX = 15;

/** No age limit (decided 2026-11-14); this only rejects typos. Upper bound: next year. */
export const CAR_YEAR_MIN = 1990;

/** [Đề xuất] 2–16 seats: from coupés to 16-seat vans (≥10 seats needs a D1 licence, §12.2). */
export const CAR_SEATS_MIN = 2;
export const CAR_SEATS_MAX = 16;

export const CarStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  REJECTED: 'REJECTED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  HIDDEN: 'HIDDEN',
  REMOVED: 'REMOVED',
} as const;
export type CarStatus = (typeof CarStatus)[keyof typeof CarStatus];

export const BodyType = {
  SEDAN: 'SEDAN',
  SUV: 'SUV',
  CROSSOVER: 'CROSSOVER',
  MPV: 'MPV',
  HATCHBACK: 'HATCHBACK',
  PICKUP: 'PICKUP',
} as const;
export type BodyType = (typeof BodyType)[keyof typeof BodyType];

export const Transmission = { MANUAL: 'MANUAL', AUTOMATIC: 'AUTOMATIC' } as const;
export type Transmission = (typeof Transmission)[keyof typeof Transmission];

export const FuelType = {
  GASOLINE: 'GASOLINE',
  DIESEL: 'DIESEL',
  ELECTRIC: 'ELECTRIC',
  HYBRID: 'HYBRID',
} as const;
export type FuelType = (typeof FuelType)[keyof typeof FuelType];

export const CarDocumentType = { REGISTRATION: 'REGISTRATION', INSPECTION: 'INSPECTION' } as const;
export type CarDocumentType = (typeof CarDocumentType)[keyof typeof CarDocumentType];

export const CarRevisionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type CarRevisionStatus = (typeof CarRevisionStatus)[keyof typeof CarRevisionStatus];

// ─── License plate ──────────────────────────────────────────────────────────

/**
 * Normalises a Vietnamese car plate to `51K-123.45` (5 digits) or `51K-1234` (old 4 digits).
 * Spaces, dots, dashes and case are ignored; returns null when it is not a car plate.
 * [Đề xuất] Series is one or two letters (e.g. `51K`, `51LD`); diplomatic plates are not accepted.
 */
export function normalizeLicensePlate(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s.-]/g, '');
  const match = /^(\d{2}[A-Z]{1,2})(\d{4,5})$/.exec(compact);
  if (!match) return null;
  const [, prefix = '', digits = ''] = match;
  return digits.length === 5
    ? `${prefix}-${digits.slice(0, 3)}.${digits.slice(3)}`
    : `${prefix}-${digits}`;
}

export const licensePlateSchema = z
  .string()
  .max(20, { error: 'Biển số không hợp lệ. Ví dụ: 51K-123.45' })
  .transform((value, ctx) => {
    const plate = normalizeLicensePlate(value);
    if (plate === null) {
      ctx.addIssue({ code: 'custom', message: 'Biển số không hợp lệ. Ví dụ: 51K-123.45' });
      return z.NEVER;
    }
    return plate;
  });

// ─── Input ──────────────────────────────────────────────────────────────────

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `Vui lòng nhập ${label}.` })
    .max(max, { error: `Tối đa ${max} ký tự.` });

/** Optional free text: blank becomes null so it can be cleared. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} tối đa ${max} ký tự.` })
    .transform((value) => (value === '' ? null : value))
    .nullable();

const idSchema = z.int().positive();

export const carYearSchema = z
  .int()
  .min(CAR_YEAR_MIN, { error: `Năm sản xuất phải từ ${CAR_YEAR_MIN} trở đi.` })
  .refine((year) => year <= vietnamYear() + 1, { error: 'Năm sản xuất không hợp lệ.' });

/** House rules (spec §4.1), each on or off, with an optional note. */
export const carRulesSchema = z.object({
  noSmoking: z.boolean(),
  noPets: z.boolean(),
  noDurianSeafood: z.boolean(),
  sameFuelLevel: z.boolean(),
  keepClean: z.boolean(),
  note: optionalText(1000, 'Ghi chú quy định'),
});

/** Optional mileage limit: km per day and the fee for each km over it. */
export const mileageLimitSchema = z.object({
  dailyKm: z
    .int()
    .min(1, { error: 'Giới hạn km mỗi ngày phải lớn hơn 0.' })
    .max(10_000, { error: 'Giới hạn km mỗi ngày không hợp lệ.' }),
  /** VND per km over the limit */
  extraFeePerKm: z
    .int()
    .min(1, { error: 'Phụ phí mỗi km vượt phải lớn hơn 0.' })
    .max(1_000_000, { error: 'Phụ phí mỗi km vượt tối đa 1.000.000đ.' }),
});

/**
 * Where the car is picked up. Only the ward and an approximate circle are public until a
 * booking is confirmed (spec §4.4). Since 1/7/2025 there are no districts: province + ward.
 * [Đề xuất] Coordinates must fall inside Vietnam's bounding box.
 */
export const carLocationSchema = z.object({
  province: text(100, 'tỉnh/thành phố'),
  ward: text(100, 'phường/xã'),
  addressLine: text(255, 'địa chỉ'),
  latitude: z
    .number()
    .min(8, { error: 'Vị trí phải nằm ở Việt Nam.' })
    .max(24, { error: 'Vị trí phải nằm ở Việt Nam.' }),
  longitude: z
    .number()
    .min(102, { error: 'Vị trí phải nằm ở Việt Nam.' })
    .max(110, { error: 'Vị trí phải nằm ở Việt Nam.' }),
});

const carFields = {
  modelId: idSchema,
  year: carYearSchema,
  licensePlate: licensePlateSchema,
  color: text(30, 'màu xe'),
  bodyType: z.enum(BodyType),
  seats: z
    .int()
    .min(CAR_SEATS_MIN, { error: `Số chỗ từ ${CAR_SEATS_MIN} đến ${CAR_SEATS_MAX}.` })
    .max(CAR_SEATS_MAX, { error: `Số chỗ từ ${CAR_SEATS_MIN} đến ${CAR_SEATS_MAX}.` }),
  transmission: z.enum(Transmission),
  fuelType: z.enum(FuelType),
  /** L/100km, or kWh/100km for electric cars; one decimal place. */
  fuelConsumption: z
    .number()
    .positive({ error: 'Mức tiêu hao phải lớn hơn 0.' })
    .max(99.9, { error: 'Mức tiêu hao không hợp lệ.' })
    .transform((value) => Math.round(value * 10) / 10)
    .nullable(),
  odometerKm: z
    .int()
    .min(0, { error: 'Số ODO không hợp lệ.' })
    .max(2_000_000, { error: 'Số ODO không hợp lệ.' }),
  description: optionalText(5000, 'Mô tả'),
  rules: carRulesSchema,
  mileageLimit: mileageLimitSchema.nullable(),
  location: carLocationSchema,
  amenityIds: z
    .array(idSchema)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Tiện nghi bị trùng.' }),
  ...rentalSettingsFields,
};

/**
 * Creating a car saves a draft (decided 2026-11-14): the basic details and the address are
 * required up front; photos, documents, amenities and the price list can come later. Rental
 * settings left out keep their defaults: approval by the owner, 5.000.000đ deposit, 2-hour
 * buffer, no delivery.
 */
export const createCarSchema = z.object({
  ...carFields,
  fuelConsumption: carFields.fuelConsumption.optional(),
  description: carFields.description.optional(),
  rules: carRulesSchema.optional(),
  mileageLimit: carFields.mileageLimit.optional(),
  amenityIds: carFields.amenityIds.optional(),
  instantBook: carFields.instantBook.optional(),
  depositAmount: carFields.depositAmount.optional(),
  bufferMinutes: carFields.bufferMinutes.optional(),
  delivery: carFields.delivery.optional(),
});

/**
 * Partial update; nested objects (`rules`, `mileageLimit`, `location`) are replaced whole.
 * On a car that has been approved, `modelId`, `year` and `licensePlate` go into a revision
 * an admin must approve (spec §12.3); everything else applies immediately.
 */
export const updateCarSchema = z.object(carFields).partial();

export const addCarPhotoSchema = z.object({
  /** `key` from `POST /uploads` with purpose CAR_PHOTO */
  uploadKey: z.string().min(1).max(300),
});

export const reorderCarPhotosSchema = z.object({
  /** Every photo of the car, in display order; the first one is the cover. */
  photoIds: z
    .array(z.uuid())
    .min(1)
    .max(CAR_PHOTO_MAX)
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Ảnh bị trùng.' }),
});

/** `expiresOn` (YYYY-MM-DD, Vietnam date) must be today or later. */
export const documentExpirySchema = z.iso
  .date({ error: 'Ngày hết hạn không hợp lệ.' })
  .refine((date) => date >= vietnamDate(), { error: 'Giấy tờ đã hết hạn.' });

export const putCarDocumentSchema = z.object({
  /** `key` from `POST /uploads` with purpose CAR_DOCUMENT */
  uploadKey: z.string().min(1).max(300),
  /** Required for INSPECTION: the inspection must still be valid. Ignored for REGISTRATION. */
  expiresOn: documentExpirySchema.optional(),
});

export const carDocumentTypeParamSchema = z.object({
  id: z.uuid(),
  type: z.enum(CarDocumentType),
});

// ─── Output ─────────────────────────────────────────────────────────────────

const timestamp = z.iso.datetime({ offset: true });

export const catalogRefSchema = z.object({ id: z.int(), name: z.string() });

export const amenitySchema = z.object({ id: z.int(), code: z.string(), name: z.string() });

export const carMakeSchema = z.object({
  id: z.int(),
  name: z.string(),
  models: z.array(catalogRefSchema),
});

export const carPhotoUrlsSchema = z.object({ lg: z.url(), sm: z.url() });

export const carPhotoSchema = z.object({
  id: z.uuid(),
  /** 0 is the cover photo */
  position: z.int(),
  urls: carPhotoUrlsSchema,
});

export const carDocumentSchema = z.object({
  id: z.uuid(),
  type: z.enum(CarDocumentType),
  expiresOn: z.iso.date().nullable(),
  /** Presigned, valid for 5 minutes */
  url: z.url(),
});

/** Changes waiting for an admin, or the last ones rejected. Null fields are unchanged. */
export const carRevisionSchema = z.object({
  id: z.uuid(),
  status: z.enum(CarRevisionStatus),
  make: catalogRefSchema.nullable(),
  model: catalogRefSchema.nullable(),
  year: z.int().nullable(),
  licensePlate: z.string().nullable(),
  documents: z.array(carDocumentSchema),
  rejectionReason: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

/** A car as its owner sees it: unmasked plate, exact address, documents. */
export const ownerCarSchema = z.object({
  id: z.uuid(),
  status: z.enum(CarStatus),
  rejectionReason: z.string().nullable(),
  submittedAt: timestamp.nullable(),
  make: catalogRefSchema,
  model: catalogRefSchema,
  year: z.int(),
  licensePlate: z.string(),
  color: z.string(),
  bodyType: z.enum(BodyType),
  seats: z.int(),
  transmission: z.enum(Transmission),
  fuelType: z.enum(FuelType),
  fuelConsumption: z.number().nullable(),
  odometerKm: z.int(),
  description: z.string().nullable(),
  rules: z.object({
    noSmoking: z.boolean(),
    noPets: z.boolean(),
    noDurianSeafood: z.boolean(),
    sameFuelLevel: z.boolean(),
    keepClean: z.boolean(),
    note: z.string().nullable(),
  }),
  mileageLimit: z.object({ dailyKm: z.int(), extraFeePerKm: z.int() }).nullable(),
  location: z.object({
    province: z.string(),
    ward: z.string(),
    addressLine: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  amenities: z.array(amenitySchema),
  instantBook: z.boolean(),
  depositAmount: z.int(),
  bufferMinutes: z.int(),
  /** Null: pickup at the car only. */
  delivery: carDeliveryViewSchema.nullable(),
  /** Null until the owner sets a price list, which is needed to submit the car. */
  pricing: carPricingViewSchema.nullable(),
  photos: z.array(carPhotoSchema),
  documents: z.array(carDocumentSchema),
  /** The pending revision, or the latest one if it was rejected; null otherwise. */
  revision: carRevisionSchema.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const ownerCarSummarySchema = z.object({
  id: z.uuid(),
  status: z.enum(CarStatus),
  make: catalogRefSchema,
  model: catalogRefSchema,
  year: z.int(),
  licensePlate: z.string(),
  coverPhoto: carPhotoUrlsSchema.nullable(),
  photoCount: z.int(),
  hasPricing: z.boolean(),
  hasPendingRevision: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export type CreateCarInput = z.infer<typeof createCarSchema>;
export type UpdateCarInput = z.infer<typeof updateCarSchema>;
export type AddCarPhotoInput = z.infer<typeof addCarPhotoSchema>;
export type ReorderCarPhotosInput = z.infer<typeof reorderCarPhotosSchema>;
export type PutCarDocumentInput = z.infer<typeof putCarDocumentSchema>;
export type CarRules = z.infer<typeof carRulesSchema>;
export type CarLocation = z.infer<typeof carLocationSchema>;
export type MileageLimit = z.infer<typeof mileageLimitSchema>;
export type Amenity = z.infer<typeof amenitySchema>;
export type CarMake = z.infer<typeof carMakeSchema>;
export type CarPhoto = z.infer<typeof carPhotoSchema>;
export type CarDocument = z.infer<typeof carDocumentSchema>;
export type CarRevision = z.infer<typeof carRevisionSchema>;
export type OwnerCar = z.infer<typeof ownerCarSchema>;
export type OwnerCarSummary = z.infer<typeof ownerCarSummarySchema>;
