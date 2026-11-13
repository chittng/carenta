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
