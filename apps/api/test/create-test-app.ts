import { type INestApplication, type ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';

/** Boots the real AppModule with the same setup as main.ts. Extra controllers are test-only. */
export async function createTestApp(
  extra: Pick<ModuleMetadata, 'controllers'> = {},
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extra.controllers ?? [],
  }).compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  setupApp(app);
  await app.init();
  return app;
}
