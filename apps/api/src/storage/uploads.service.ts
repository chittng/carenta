import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';

import {
  type CreateUploadInput,
  ErrorCode,
  UPLOAD_MAX_BYTES,
  type UploadPurpose,
  type UploadTicket,
} from '@carenta/shared';

import { AppException } from '../common/errors/app.exception.js';
import { type BucketKind, StorageService } from './storage.service.js';
import {
  type ImageSpec,
  type PrivateUploadPurpose,
  type PurposeConfig,
  UPLOAD_PURPOSES,
} from './upload-purposes.js';

type CarPhotoVariant = keyof typeof UPLOAD_PURPOSES.CAR_PHOTO.variants;
type AvatarVariant = keyof typeof UPLOAD_PURPOSES.AVATAR.variants;

/** Pending uploads live here until claimed; a bucket lifecycle rule deletes leftovers after a day. */
export const UPLOADS_PREFIX = 'uploads';

/** Decompression-bomb guard: a 10 MB file can still decode to a huge bitmap. */
const MAX_INPUT_PIXELS = 60_000_000;

const WEBP_QUALITY = 80;

/** Processed keys are unique, so public images can be cached forever. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

const ACCEPTED_FORMATS = {
  jpeg: { ext: 'jpg', contentType: 'image/jpeg' },
  png: { ext: 'png', contentType: 'image/png' },
  webp: { ext: 'webp', contentType: 'image/webp' },
} as const;

type AcceptedFormat = (typeof ACCEPTED_FORMATS)[keyof typeof ACCEPTED_FORMATS];

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UPLOAD_KEY_PATTERN = new RegExp(
  `^${UPLOADS_PREFIX}/(?<userId>${UUID})/(?<dir>[a-z-]+)/(?<id>${UUID})$`,
);

function uploadNotFound() {
  return new AppException(
    HttpStatus.NOT_FOUND,
    ErrorCode.UPLOAD_NOT_FOUND,
    'Không tìm thấy ảnh đã tải lên hoặc ảnh đã hết hạn. Vui lòng tải ảnh lên lại.',
  );
}

function invalidFile() {
  return new AppException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ErrorCode.UPLOAD_INVALID_FILE,
    'Tệp không phải ảnh hợp lệ. Vui lòng chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB.',
  );
}

/** An object to write, produced before anything is stored so a bad image stores nothing. */
type Output =
  | { kind: 'write'; bucket: BucketKind; key: string; body: Buffer; contentType: string }
  | { kind: 'copy'; key: string; contentType: string };

/**
 * File uploads, used by feature modules (car photos, driver licenses, chat, ...).
 *
 * 1. `createUpload` gives the browser a presigned PUT URL under `uploads/<userId>/...`
 *    in the private bucket; the file never passes through the API.
 * 2. The browser sends the returned `key` to a feature endpoint, which calls `claim`.
 *    That checks the key belongs to the user, validates the image, writes it to its
 *    final place (resized for public images) and returns the key to save in the DB.
 * 3. Read back with `publicUrls` (public) or `privateUrl` (private, after the caller
 *    has checked the user owns the resource or is an admin).
 */
@Injectable()
export class UploadsService {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  async createUpload(userId: string, input: CreateUploadInput): Promise<UploadTicket> {
    const key = `${UPLOADS_PREFIX}/${userId}/${UPLOAD_PURPOSES[input.purpose].dir}/${randomUUID()}`;
    const presigned = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
      contentLength: input.size,
    });
    return {
      key,
      uploadUrl: presigned.url,
      method: 'PUT',
      headers: presigned.headers,
      expiresAt: presigned.expiresAt.toISOString(),
    };
  }

  /**
   * Validates an upload made by `userId` for `purpose` and moves it into place.
   * Returns the key to store (e.g. `CarPhoto.fileKey`). The upload is consumed:
   * claiming the same key twice fails with `UPLOAD_NOT_FOUND`.
   */
  async claim(userId: string, purpose: UploadPurpose, uploadKey: string): Promise<string> {
    const config: PurposeConfig = UPLOAD_PURPOSES[purpose];
    const match = UPLOAD_KEY_PATTERN.exec(uploadKey)?.groups;
    if (!match || match.userId !== userId || match.dir !== config.dir) throw uploadNotFound();
    const id = match.id!;

    const stored = await this.storage.stat('private', uploadKey);
    if (!stored) throw uploadNotFound();
    if (stored.size > UPLOAD_MAX_BYTES) {
      await this.storage.delete('private', [uploadKey]);
      throw invalidFile();
    }

    const original = await this.storage.read('private', uploadKey);
    let finalKey: string;
    let outputs: Output[];
    try {
      const format = await detectFormat(original);
      if (config.bucket === 'public') {
        finalKey = `${config.dir}/${id}`;
        outputs = await Promise.all(
          Object.entries(config.variants).map(async ([variant, spec]): Promise<Output> => ({
            kind: 'write',
            bucket: 'public',
            key: `${finalKey}/${variant}.webp`,
            body: await toWebp(original, spec),
            contentType: 'image/webp',
          })),
        );
      } else if (config.reencode) {
        finalKey = `${config.dir}/${id}.webp`;
        outputs = [
          {
            kind: 'write',
            bucket: 'private',
            key: finalKey,
            body: await toWebp(original, config.reencode),
            contentType: 'image/webp',
          },
        ];
      } else {
        // Decode fully once so a truncated or corrupt file is rejected now, not when viewed.
        await sharp(original, { limitInputPixels: MAX_INPUT_PIXELS }).stats();
        finalKey = `${config.dir}/${id}.${format.ext}`;
        outputs = [{ kind: 'copy', key: finalKey, contentType: format.contentType }];
      }
    } catch (error) {
      // Unsupported format, or sharp could not decode it (not an image, or corrupt).
      await this.storage.delete('private', [uploadKey]);
      throw error instanceof AppException ? error : invalidFile();
    }

    await Promise.all(
      outputs.map((output) =>
        output.kind === 'write'
          ? this.storage.write(output.bucket, output.key, output.body, {
              contentType: output.contentType,
              cacheControl: output.bucket === 'public' ? IMMUTABLE_CACHE : undefined,
            })
          : this.storage.copy(
              { bucket: 'private', key: uploadKey },
              { bucket: 'private', key: output.key },
              output.contentType,
            ),
      ),
    );
    await this.storage.delete('private', [uploadKey]);
    return finalKey;
  }

  /** Public URLs of a car photo (`CarPhoto.fileKey`): `lg` for the gallery, `sm` for cards. */
  carPhotoUrls(key: string): Record<CarPhotoVariant, string> {
    return { lg: this.variantUrl(key, 'lg'), sm: this.variantUrl(key, 'sm') };
  }

  /** Public URL of an avatar (`User.avatarKey`). */
  avatarUrl(key: string): string {
    return this.variantUrl(key, 'md' satisfies AvatarVariant);
  }

  private variantUrl(key: string, variant: string): string {
    return this.storage.publicUrl(`${key}/${variant}.webp`);
  }

  /** Short-lived URL of a private file. Only call after checking the user may see it. */
  privateUrl(_purpose: PrivateUploadPurpose, key: string): Promise<string> {
    return this.storage.presignDownload(key);
  }

  /** Deletes a stored file and all its variants, e.g. when a car photo is removed. */
  async remove(purpose: UploadPurpose, key: string): Promise<void> {
    const config: PurposeConfig = UPLOAD_PURPOSES[purpose];
    if (config.bucket === 'public') {
      const variants = Object.keys(config.variants).map((variant) => `${key}/${variant}.webp`);
      await this.storage.delete('public', variants);
    } else {
      await this.storage.delete('private', [key]);
    }
  }
}

/** The real format from the file's bytes; the client's Content-Type is not trusted. */
async function detectFormat(image: Buffer): Promise<AcceptedFormat> {
  const { format } = await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (format === 'jpeg' || format === 'png' || format === 'webp') return ACCEPTED_FORMATS[format];
  throw invalidFile();
}

/** Resized WebP, rotated upright from EXIF. sharp drops all metadata (GPS included) by default. */
function toWebp(image: Buffer, spec: ImageSpec): Promise<Buffer> {
  return sharp(image, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({
      width: spec.width,
      height: spec.height,
      fit: spec.fit,
      withoutEnlargement: spec.fit === 'inside',
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
