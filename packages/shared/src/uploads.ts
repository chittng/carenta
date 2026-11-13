import { z } from 'zod';

/**
 * What a file is uploaded for. It decides where the file ends up: car photos and
 * avatars are resized into the public bucket, everything else stays private and is
 * only readable through short-lived presigned URLs.
 */
export const UploadPurpose = {
  AVATAR: 'AVATAR',
  CAR_PHOTO: 'CAR_PHOTO',
  DRIVER_LICENSE: 'DRIVER_LICENSE',
  CAR_DOCUMENT: 'CAR_DOCUMENT',
  TRIP_REPORT_PHOTO: 'TRIP_REPORT_PHOTO',
  DISPUTE_EVIDENCE: 'DISPUTE_EVIDENCE',
  CHAT_IMAGE: 'CHAT_IMAGE',
} as const;

export type UploadPurpose = (typeof UploadPurpose)[keyof typeof UploadPurpose];

/** [Đề xuất] Only images: JPEG, PNG or WebP. Browsers convert iPhone HEIC to JPEG on upload. */
export const UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

/** [Đề xuất] 10 MB per file. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Body of `POST /uploads`: what the browser is about to upload. */
export const createUploadSchema = z.object({
  purpose: z.enum(UploadPurpose),
  contentType: z.enum(UPLOAD_CONTENT_TYPES, {
    error: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.',
  }),
  size: z
    .int()
    .min(1, { error: 'Tệp rỗng.' })
    .max(UPLOAD_MAX_BYTES, { error: 'Ảnh tối đa 10 MB.' }),
});

export type CreateUploadInput = z.infer<typeof createUploadSchema>;

/**
 * Where and how the browser uploads the file: `PUT uploadUrl` with exactly these
 * headers and the file as the body. `key` is then sent to the feature endpoint
 * (e.g. adding a car photo), which validates the file and moves it into place.
 */
export const uploadTicketSchema = z.object({
  key: z.string(),
  uploadUrl: z.url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});

export type UploadTicket = z.infer<typeof uploadTicketSchema>;
