import { type ApiErrorDetail, apiErrorSchema, ErrorCode } from '@carenta/shared';

/**
 * Codes the web app produces itself when there is no usable API response. They are not in
 * `ErrorCode` because the API never sends them.
 */
export const ClientErrorCode = {
  /** The request never got an HTTP response: offline, DNS, CORS, or the API is down. */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** The browser could not PUT a file to storage (network, expired link, rejected by S3). */
  UPLOAD_FAILED: 'UPLOAD_FAILED',
} as const;

const NETWORK_MESSAGE = 'Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng và thử lại.';
const UNKNOWN_MESSAGE = 'Đã có lỗi xảy ra. Vui lòng thử lại sau.';

/** A failed API call. `message` is Vietnamese and safe to show to users. */
export class ApiRequestError extends Error {
  override readonly name = 'ApiRequestError';

  constructor(
    /** HTTP status, or 0 when there was no response. */
    readonly status: number,
    /** An `ErrorCode` from the API, or a `ClientErrorCode`. */
    readonly code: string,
    message: string,
    /** Per-field problems, only for `VALIDATION_FAILED`. */
    readonly details: ApiErrorDetail[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }

  /** Client errors are the caller's to fix; retrying the same request will not help. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export function networkError(cause: unknown): ApiRequestError {
  return new ApiRequestError(0, ClientErrorCode.NETWORK_ERROR, NETWORK_MESSAGE, [], { cause });
}

/**
 * Builds the error for a non-2xx response. Bodies that are not the API's `{ code, message }`
 * shape (e.g. a proxy's HTML 502 page while the API is down) get a generic message.
 */
export async function errorFromResponse(response: Response): Promise<ApiRequestError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details } = parsed.data;
    return new ApiRequestError(response.status, code, message, details);
  }
  // Next's dev proxy answers 500 when the API is not running at all.
  const code = response.status >= 500 ? ErrorCode.SERVICE_UNAVAILABLE : ErrorCode.BAD_REQUEST;
  return new ApiRequestError(response.status, code, UNKNOWN_MESSAGE);
}

/** The Vietnamese message to show for any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : UNKNOWN_MESSAGE;
}
