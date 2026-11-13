import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';

import { type ApiError, type ApiErrorDetail, ErrorCode } from '@carenta/shared';

import { AppException } from './app.exception.js';
import {
  defaultErrorFor,
  INTERNAL_ERROR,
  INVALID_JSON,
  VALIDATION_FAILED_MESSAGE,
} from './default-errors.js';

interface ErrorResponse {
  status: number;
  body: ApiError;
}

/**
 * Turns every exception into `{ code, message }` with a Vietnamese message.
 * Unexpected errors are logged and answered with a generic 500 so internals never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const { status, body } = this.toResponse(exception);

    if (status >= 500) {
      const request = ctx.getRequest<{ method?: string; url?: string }>();
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  private toResponse(exception: unknown): ErrorResponse {
    if (exception instanceof AppException) {
      return { status: exception.getStatus(), body: exception.toBody() };
    }

    if (exception instanceof ZodValidationException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: ErrorCode.VALIDATION_FAILED,
          message: VALIDATION_FAILED_MESSAGE,
          details: toDetails(exception.getZodError()),
        },
      };
    }

    // Our own response failed its schema: a server bug, not the client's fault.
    if (exception instanceof ZodSerializationException) {
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: INTERNAL_ERROR };
    }

    if (exception instanceof HttpException) {
      // The Express adapter wraps body-parser errors in an HttpException and keeps the
      // original as `cause`; invalid JSON deserves a clearer message than "bad request".
      if (isInvalidJson(exception.cause)) {
        return { status: HttpStatus.BAD_REQUEST, body: INVALID_JSON };
      }
      const status = exception.getStatus();
      return { status, body: defaultErrorFor(status) };
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: INTERNAL_ERROR };
  }
}

function toDetails(zodError: unknown): ApiErrorDetail[] {
  // zod's instanceof checks traits, so it also matches errors from another zod copy.
  if (!(zodError instanceof z.core.$ZodError)) {
    return [];
  }
  return zodError.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function isInvalidJson(cause: unknown): boolean {
  return cause instanceof SyntaxError && 'type' in cause && cause.type === 'entity.parse.failed';
}
