import {
  ErrorCode,
  type UploadContentType,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_MAX_BYTES,
  type UploadPurpose,
  type UploadTicket,
} from '@carenta/shared';

import { api } from './api/client';
import { ApiRequestError, ClientErrorCode } from './api/errors';

/** For `<input type="file" accept>`. */
export const IMAGE_ACCEPT = UPLOAD_CONTENT_TYPES.join(',');

function isUploadContentType(type: string): type is UploadContentType {
  return (UPLOAD_CONTENT_TYPES as readonly string[]).includes(type);
}

/**
 * Why a picked file cannot be uploaded, before asking the API: the same type and size rules
 * as `createUploadSchema`. The API still checks the real content after the upload.
 */
export function imageFileIssue(file: Pick<File, 'type' | 'size'>): string | null {
  if (!isUploadContentType(file.type)) return 'Chỉ nhận ảnh JPG, PNG hoặc WebP.';
  if (file.size === 0) return 'Tệp rỗng.';
  if (file.size > UPLOAD_MAX_BYTES) return 'Ảnh tối đa 10 MB.';
  return null;
}

export interface UploadOptions {
  /** Fraction uploaded so far, 0 to 1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

// The browser sets these itself and refuses them from script.
const FORBIDDEN_HEADERS = new Set(['content-length', 'host']);

function uploadFailed(): ApiRequestError {
  return new ApiRequestError(
    0,
    ClientErrorCode.UPLOAD_FAILED,
    'Tải ảnh lên không thành công. Vui lòng thử lại.',
  );
}

/** PUTs the file to the presigned URL. XHR rather than fetch: fetch reports no upload progress. */
function putFile(ticket: UploadTicket, file: File, options: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method, ticket.uploadUrl);
    for (const [name, value] of Object.entries(ticket.headers)) {
      if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) xhr.setRequestHeader(name, value);
    }
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(uploadFailed());
    });
    xhr.addEventListener('error', () => reject(uploadFailed()));
    xhr.addEventListener('abort', () => reject(new DOMException('Upload aborted', 'AbortError')));
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/**
 * Uploads an image straight to storage (spec §14) and returns its upload `key`, which the
 * caller then sends to the feature endpoint (e.g. `POST /owner/cars/:id/photos`). Throws
 * `ApiRequestError` with a Vietnamese message.
 */
export async function uploadImage(
  file: File,
  purpose: UploadPurpose,
  options: UploadOptions = {},
): Promise<string> {
  const issue = imageFileIssue(file);
  if (issue) throw new ApiRequestError(400, ErrorCode.UPLOAD_INVALID_FILE, issue);

  const ticket = await api.post<UploadTicket>(
    '/uploads',
    { purpose, contentType: file.type, size: file.size },
    { signal: options.signal },
  );
  options.onProgress?.(0);
  await putFile(ticket, file, options);
  options.onProgress?.(1);
  return ticket.key;
}
