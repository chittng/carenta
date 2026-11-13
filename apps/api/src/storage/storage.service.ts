import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import { AppConfigService } from '../config/env.js';

export type BucketKind = 'public' | 'private';

/** Lifetime of a presigned upload URL. */
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
/** Lifetime of a presigned download URL for a private file. */
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export interface PresignedUpload {
  url: string;
  /** Headers the client must send with the PUT; they are part of the signature. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

/**
 * Thin wrapper over the S3 API (RustFS locally, Cloudflare R2 when deployed).
 * It knows nothing about users or permissions: callers check access first.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  private readonly buckets: Record<BucketKind, string>;
  private readonly publicBaseUrl: string;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
      // The SDK otherwise adds CRC32 checksums to every request, which R2 and
      // RustFS do not fully support and which break presigned browser uploads.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.buckets = {
      public: config.get('S3_PUBLIC_BUCKET', { infer: true }),
      private: config.get('S3_PRIVATE_BUCKET', { infer: true }),
    };
    this.publicBaseUrl = config.get('S3_PUBLIC_BASE_URL', { infer: true });
  }

  onModuleDestroy() {
    this.client.destroy();
  }

  /**
   * URL the browser PUTs a file to, in the private bucket. Content type and exact
   * length are signed, so the upload fails if the client sends anything else.
   */
  async presignUpload(params: {
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.buckets.private,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      url,
      // Browsers set Content-Length from the body themselves (and refuse to let
      // scripts set it), so only Content-Type is passed on.
      headers: { 'Content-Type': params.contentType },
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
    };
  }

  /** Short-lived URL to read a private file. Check that the caller may see it first. */
  presignDownload(key: string, expiresInSeconds = DOWNLOAD_URL_TTL_SECONDS): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.buckets.private, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Permanent URL of a file in the public bucket. */
  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** Size and type of an object, or `null` if it does not exist. */
  async stat(bucket: BucketKind, key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
      );
      return { size: head.ContentLength ?? 0, contentType: head.ContentType };
    } catch (error) {
      if (error instanceof NotFound || error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async read(bucket: BucketKind, key: string): Promise<Buffer> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
    );
    if (!object.Body) throw new Error(`Empty body for s3://${this.buckets[bucket]}/${key}`);
    return Buffer.from(await object.Body.transformToByteArray());
  }

  async write(
    bucket: BucketKind,
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl?: string },
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        Body: body,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async copy(
    from: { bucket: BucketKind; key: string },
    to: { bucket: BucketKind; key: string },
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        CopySource: `${this.buckets[from.bucket]}/${encodeURIComponent(from.key)}`,
        Bucket: this.buckets[to.bucket],
        Key: to.key,
        ContentType: contentType,
        MetadataDirective: 'REPLACE',
      }),
    );
  }

  /** Deletes the given keys; missing keys are ignored. */
  async delete(bucket: BucketKind, keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.buckets[bucket],
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }
}
