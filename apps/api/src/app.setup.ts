import { type INestApplication } from '@nestjs/common';

import { requestLogger } from './common/logging/request-logger.middleware.js';
import { AppConfigService } from './config/env.js';
import { setupApiDocs } from './docs/api-docs.js';

export const API_PREFIX = 'api/v1';

/** App-level wiring shared by main.ts and tests, so tests exercise the real setup. */
export function setupApp(app: INestApplication) {
  const config = app.get(AppConfigService);

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
