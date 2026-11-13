import { HttpStatus } from '@nestjs/common';

import { type ApiError, ErrorCode } from '@carenta/shared';

/** Fallback body for Nest's built-in HTTP exceptions, whose messages are English. */
const DEFAULT_ERRORS: Partial<Record<number, ApiError>> = {
  [HttpStatus.UNAUTHORIZED]: {
    code: ErrorCode.UNAUTHORIZED,
    message: 'Vui lòng đăng nhập để tiếp tục.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: ErrorCode.FORBIDDEN,
    message: 'Bạn không có quyền thực hiện thao tác này.',
  },
  [HttpStatus.NOT_FOUND]: {
    code: ErrorCode.NOT_FOUND,
    message: 'Không tìm thấy nội dung yêu cầu.',
  },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    code: ErrorCode.METHOD_NOT_ALLOWED,
    message: 'Phương thức không được hỗ trợ.',
  },
  [HttpStatus.CONFLICT]: {
    code: ErrorCode.CONFLICT,
    message: 'Dữ liệu đã thay đổi hoặc bị trùng. Vui lòng tải lại và thử lại.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: ErrorCode.PAYLOAD_TOO_LARGE,
    message: 'Dữ liệu gửi lên quá lớn.',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    message: 'Định dạng dữ liệu không được hỗ trợ.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: ErrorCode.TOO_MANY_REQUESTS,
    message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: ErrorCode.SERVICE_UNAVAILABLE,
    message: 'Hệ thống đang bận. Vui lòng thử lại sau.',
  },
};

export const INTERNAL_ERROR: ApiError = {
  code: ErrorCode.INTERNAL_ERROR,
  message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
};

export const VALIDATION_FAILED_MESSAGE = 'Dữ liệu không hợp lệ.';

export const INVALID_JSON: ApiError = {
  code: ErrorCode.BAD_REQUEST,
  message: 'Dữ liệu gửi lên không đúng định dạng JSON.',
};

const GENERIC_CLIENT_ERROR: ApiError = {
  code: ErrorCode.BAD_REQUEST,
  message: 'Yêu cầu không hợp lệ.',
};

export function defaultErrorFor(status: number): ApiError {
  return DEFAULT_ERRORS[status] ?? (status >= 500 ? INTERNAL_ERROR : GENERIC_CLIENT_ERROR);
}
