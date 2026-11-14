import { z } from 'zod';

/**
 * Machine-readable error codes returned by the API in `{ code, message }`.
 * Feature modules add their own codes here so the web app can branch on them.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Authentication
  /** Registering with an email that already has an account. */
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  /** Wrong email or password (deliberately not saying which). */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** The account was locked by an admin (spec §12.5). */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  /** The action needs a verified email; the web app offers to resend the link. */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  EMAIL_ALREADY_VERIFIED: 'EMAIL_ALREADY_VERIFIED',
  /** A verification or password reset link that is unknown, used or expired. */
  INVALID_LINK: 'INVALID_LINK',
  /** Change password: the current password is wrong. */
  WRONG_PASSWORD: 'WRONG_PASSWORD',

  // Uploads
  /** The upload key is unknown, expired, belongs to someone else or was made for another purpose. */
  UPLOAD_NOT_FOUND: 'UPLOAD_NOT_FOUND',
  /** The uploaded file is not a JPEG/PNG/WebP image, is corrupt, or is too large. */
  UPLOAD_INVALID_FILE: 'UPLOAD_INVALID_FILE',

  // Cars
  /** A make, model or amenity that is not in the catalogue (or was deactivated). */
  CATALOG_ITEM_NOT_FOUND: 'CATALOG_ITEM_NOT_FOUND',
  /** Another car already has this plate, or another pending revision asks for it. */
  LICENSE_PLATE_TAKEN: 'LICENSE_PLATE_TAKEN',
  /** The action is not allowed in the car's current status (e.g. deleting a listed car). */
  CAR_STATUS_CONFLICT: 'CAR_STATUS_CONFLICT',
  /** Submitting for review with photos or documents missing; `details` lists them. */
  CAR_INCOMPLETE: 'CAR_INCOMPLETE',
  /** More than 15 photos, or fewer than 4 on a car that has been approved. */
  CAR_PHOTO_LIMIT: 'CAR_PHOTO_LIMIT',
  /** An owner block overlaps a booking that holds the calendar, including its buffer. */
  AVAILABILITY_BOOKING_CONFLICT: 'AVAILABILITY_BOOKING_CONFLICT',
  /** A quote or booking request overlaps an owner block or a holding booking. */
  CAR_UNAVAILABLE: 'CAR_UNAVAILABLE',
  RENTAL_TOO_SHORT: 'RENTAL_TOO_SHORT',
  RENTAL_TOO_LONG: 'RENTAL_TOO_LONG',
  RENTAL_PRICE_UNAVAILABLE: 'RENTAL_PRICE_UNAVAILABLE',
  DELIVERY_UNAVAILABLE: 'DELIVERY_UNAVAILABLE',
  DELIVERY_TOO_FAR: 'DELIVERY_TOO_FAR',

  // Console
  /** A make, model or amenity with the same name (or code) already exists. */
  CATALOG_DUPLICATE: 'CATALOG_DUPLICATE',
  /** Locking an account that is already locked, or unlocking one that is not. */
  USER_STATUS_CONFLICT: 'USER_STATUS_CONFLICT',

  // Driver licenses
  /** Another account already uses this license number (pending or approved). */
  DRIVER_LICENSE_TAKEN: 'DRIVER_LICENSE_TAKEN',
  /** Reviewing a license that is not pending, or approving one that has expired. */
  DRIVER_LICENSE_STATUS_CONFLICT: 'DRIVER_LICENSE_STATUS_CONFLICT',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const apiErrorDetailSchema = z.object({
  /** Dot-separated path of the invalid field, e.g. `pricing.weekdayPrice`. Empty for the root. */
  path: z.string(),
  message: z.string(),
});

/** Body of every non-2xx API response. `message` is Vietnamese and safe to show to users. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  /** Present only for `VALIDATION_FAILED`: one entry per invalid field. */
  details: z.array(apiErrorDetailSchema).optional(),
});

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
