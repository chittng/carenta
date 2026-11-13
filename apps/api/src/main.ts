import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';
import { AppConfigService } from './config/env.js';
import { API_DOCS_PATH } from './docs/api-docs.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);

  const port = app.get(AppConfigService).get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API docs: http://localhost:${port}${API_DOCS_PATH}`, 'Bootstrap');
}

await bootstrap();
