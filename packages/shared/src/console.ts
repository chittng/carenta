import { z } from 'zod';

import {
  CarDocumentType,
  CarStatus,
  carPhotoUrlsSchema,
  catalogRefSchema,
  ownerCarSchema,
} from './cars.js';
import { paginationQuerySchema } from './pagination.js';

/** Admin-only API (spec §11): car review, users, catalogue. */

const searchText = z
  .string()
  .trim()
  .max(100)
  .transform((value) => (value === '' ? undefined : value))
  .optional();

/** Why an admin rejected, hid or removed something, or locked an account. Sent to the user. */
export const moderationReasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, { error: 'Vui lòng nhập lý do.' })
    .max(1000, { error: 'Lý do tối đa 1000 ký tự.' }),
});

const timestamp = z.iso.datetime({ offset: true });

const userRefSchema = z.object({ id: z.uuid(), fullName: z.string(), email: z.email() });

// ─── Cars ───────────────────────────────────────────────────────────────────

export const consoleCarListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CarStatus).optional(),
  /** Part of the plate, or of the owner's name or email. */
  q: searchText,
});

/**
 * A row in the car list. Cars waiting for review come oldest submission first, so the
 * queue is worked in order; other cars newest first.
 */
export const consoleCarSummarySchema = z.object({
  id: z.uuid(),
  status: z.enum(CarStatus),
  make: catalogRefSchema,
  model: catalogRefSchema,
  year: z.int(),
  licensePlate: z.string(),
  coverPhoto: carPhotoUrlsSchema.nullable(),
  owner: userRefSchema,
  hasPendingRevision: z.boolean(),
  submittedAt: timestamp.nullable(),
  updatedAt: timestamp,
});

/** Everything the owner sees, plus who owns it and who reviewed it. */
export const consoleCarSchema = ownerCarSchema.extend({
  owner: userRefSchema.extend({
    phone: z.string().nullable(),
    status: z.enum(['ACTIVE', 'LOCKED']),
  }),
  reviewedAt: timestamp.nullable(),
  reviewedBy: userRefSchema.nullable(),
});

/** A pending change to an approved car, oldest first. Null fields are unchanged. */
export const consoleRevisionSummarySchema = z.object({
  id: z.uuid(),
  car: z.object({
    id: z.uuid(),
    status: z.enum(CarStatus),
    make: catalogRefSchema,
    model: catalogRefSchema,
    year: z.int(),
    licensePlate: z.string(),
  }),
  changes: z.object({
    make: catalogRefSchema.nullable(),
    model: catalogRefSchema.nullable(),
    year: z.int().nullable(),
    licensePlate: z.string().nullable(),
    documentTypes: z.array(z.enum(CarDocumentType)),
  }),
  owner: userRefSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});

// ─── Users ──────────────────────────────────────────────────────────────────

export const UserStatus = { ACTIVE: 'ACTIVE', LOCKED: 'LOCKED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const DriverLicenseStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type DriverLicenseStatus = (typeof DriverLicenseStatus)[keyof typeof DriverLicenseStatus];

export const consoleUserListQuerySchema = paginationQuerySchema.extend({
  /** Part of the name, email or phone. */
  q: searchText,
  status: z.enum(UserStatus).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});

/** A row in the user list, newest first. */
export const consoleUserSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  fullName: z.string(),
  phone: z.string().nullable(),
  role: z.enum(['USER', 'ADMIN']),
  status: z.enum(UserStatus),
  emailVerified: z.boolean(),
  /** Null until a driver license is submitted. */
  driverLicenseStatus: z.enum(DriverLicenseStatus).nullable(),
  carCount: z.int(),
  createdAt: timestamp,
});

export const consoleUserSchema = consoleUserSummarySchema.extend({
  avatarUrl: z.url().nullable(),
  lockedAt: timestamp.nullable(),
  lockReason: z.string().nullable(),
  cars: z.array(
    z.object({
      id: z.uuid(),
      status: z.enum(CarStatus),
      make: catalogRefSchema,
      model: catalogRefSchema,
      year: z.int(),
      licensePlate: z.string(),
    }),
  ),
  bookingCount: z.object({ asRenter: z.int(), asOwner: z.int() }),
});

// ─── Catalogue ──────────────────────────────────────────────────────────────

const catalogName = z
  .string()
  .trim()
  .min(1, { error: 'Vui lòng nhập tên.' })
  .max(100, { error: 'Tên tối đa 100 ký tự.' });

/** Items are never deleted, only turned off (decided 2026-11-14), so cars keep theirs. */
export const createCatalogItemSchema = z.object({ name: catalogName });

export const updateCatalogItemSchema = z
  .object({ name: catalogName, isActive: z.boolean() })
  .partial();

export const createAmenitySchema = z.object({
  /** Stable key used by code, e.g. `CAMERA_360`; cannot change later. */
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,49}$/, { error: 'Mã gồm chữ in hoa, số và dấu gạch dưới.' }),
  name: catalogName,
  sortOrder: z.int().min(0).max(10_000).default(0),
});

export const updateAmenitySchema = z
  .object({ name: catalogName, sortOrder: z.int().min(0).max(10_000), isActive: z.boolean() })
  .partial();

export const consoleCarModelSchema = z.object({
  id: z.int(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  carCount: z.int(),
});

export const consoleCarMakeSchema = z.object({
  id: z.int(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  models: z.array(consoleCarModelSchema),
});

export const consoleAmenitySchema = z.object({
  id: z.int(),
  code: z.string(),
  name: z.string(),
  sortOrder: z.int(),
  isActive: z.boolean(),
  carCount: z.int(),
});

export const intIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export type ConsoleCarListQuery = z.infer<typeof consoleCarListQuerySchema>;
export type ConsoleCarSummary = z.infer<typeof consoleCarSummarySchema>;
export type ConsoleCar = z.infer<typeof consoleCarSchema>;
export type ConsoleRevisionSummary = z.infer<typeof consoleRevisionSummarySchema>;
export type ConsoleUserListQuery = z.infer<typeof consoleUserListQuerySchema>;
export type ConsoleUserSummary = z.infer<typeof consoleUserSummarySchema>;
export type ConsoleUser = z.infer<typeof consoleUserSchema>;
export type ConsoleCarMake = z.infer<typeof consoleCarMakeSchema>;
export type ConsoleCarModel = z.infer<typeof consoleCarModelSchema>;
export type ConsoleAmenity = z.infer<typeof consoleAmenitySchema>;
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
export type CreateAmenityInput = z.infer<typeof createAmenitySchema>;
export type UpdateAmenityInput = z.infer<typeof updateAmenitySchema>;
