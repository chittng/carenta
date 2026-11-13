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
