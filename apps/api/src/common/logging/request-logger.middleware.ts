import { Logger } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';

const logger = new Logger('HTTP');

/**
 * Logs one line per request once the response is sent: method, path, status, duration.
 * The query string is dropped because it can carry tokens (email verification, password reset).
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = performance.now();

  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    const path = req.originalUrl.split('?')[0];
    const line = `${req.method} ${path} ${res.statusCode} ${durationMs}ms`;

    if (res.statusCode >= 500) {
      logger.error(line);
    } else if (res.statusCode >= 400) {
      logger.warn(line);
    } else {
      logger.log(line);
    }
  });

  next();
}
