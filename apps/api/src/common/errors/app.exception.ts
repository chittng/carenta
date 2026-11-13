import { HttpException, type HttpStatus } from '@nestjs/common';

import { type ApiError, type ApiErrorDetail, type ErrorCode } from '@carenta/shared';

/**
 * The exception feature code throws for expected failures. The filter sends
 * `{ code, message }` as-is, so `message` must be Vietnamese and user-facing.
 *
 * @example throw new AppException(HttpStatus.CONFLICT, 'CAR_UNAVAILABLE', 'Xe đã có người đặt trong khoảng thời gian này.');
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode | (string & {}),
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super({ code, message, details } satisfies ApiError, status);
  }

  toBody(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}
