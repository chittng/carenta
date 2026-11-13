import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { AppConfigService } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The app's single Prisma client. It connects lazily on the first query, so booting
 * (and tests that never touch the database) do not need Postgres to be up.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(AppConfigService) config: AppConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
