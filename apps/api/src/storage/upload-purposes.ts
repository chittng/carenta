import { type UploadPurpose } from '@carenta/shared';

/** How one output image is produced: always re-encoded to WebP with metadata stripped. */
export interface ImageSpec {
  width: number;
  height: number;
  /** `inside` keeps the aspect ratio within the box; `cover` crops to fill it. */
  fit: 'inside' | 'cover';
}

/** Public images: one WebP per variant at `<key>/<variant>.webp`; the stored key is `<key>`. */
export interface PublicPurpose {
  bucket: 'public';
  dir: string;
  variants: Record<string, ImageSpec>;
}

/**
 * Private files: one object at the stored key. With `reencode` the image is resized to
 * WebP and stripped of metadata (EXIF GPS etc.); without it the original bytes are kept,
 * which matters for evidence such as trip report photos.
 */
export interface PrivatePurpose {
  bucket: 'private';
  dir: string;
  reencode?: ImageSpec;
}

export type PurposeConfig = PublicPurpose | PrivatePurpose;

/** [Đề xuất] Sizes and storage rules per purpose; recorded in docs/SPEC.md. */
export const UPLOAD_PURPOSES = {
  AVATAR: {
    bucket: 'public',
    dir: 'avatars',
    variants: { md: { width: 256, height: 256, fit: 'cover' } },
  },
  CAR_PHOTO: {
    bucket: 'public',
    dir: 'car-photos',
    variants: {
      lg: { width: 1600, height: 1600, fit: 'inside' },
      sm: { width: 640, height: 640, fit: 'inside' },
    },
  },
  DRIVER_LICENSE: { bucket: 'private', dir: 'driver-licenses' },
  CAR_DOCUMENT: { bucket: 'private', dir: 'car-documents' },
  TRIP_REPORT_PHOTO: { bucket: 'private', dir: 'trip-report-photos' },
  DISPUTE_EVIDENCE: { bucket: 'private', dir: 'dispute-evidence' },
  // Re-encoded so EXIF GPS cannot reveal where the sender is before a booking is confirmed.
  CHAT_IMAGE: {
    bucket: 'private',
    dir: 'chat-images',
    reencode: { width: 1600, height: 1600, fit: 'inside' },
  },
} as const satisfies Record<UploadPurpose, PurposeConfig>;

/** Purposes stored in the private bucket, i.e. the ones that need a presigned URL to read. */
export type PrivateUploadPurpose = {
  [P in UploadPurpose]: (typeof UPLOAD_PURPOSES)[P]['bucket'] extends 'private' ? P : never;
}[UploadPurpose];
