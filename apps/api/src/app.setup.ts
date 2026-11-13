import { type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { requestLogger } from './common/logging/request-logger.middleware.js';
import { AppConfigService } from './config/env.js';
import { setupApiDocs } from './docs/api-docs.js';

export const API_PREFIX = 'api/v1';

/** App-level wiring shared by main.ts and tests, so tests exercise the real setup. */
export function setupApp(app: NestExpressApplication) {
  const config = app.get(AppConfigService);

  // req.ip comes from X-Forwarded-For only through this many trusted proxies (rate limits).
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    // A list (not a bare string) so other origins get no Access-Control-Allow-Origin at all.
    origin: [config.get('WEB_URL', { infer: true })],
    // Auth uses httpOnly cookies, so the browser must send credentials.
    credentials: true,
  });
  app.enableShutdownHooks();
  setupApiDocs(app);
}
