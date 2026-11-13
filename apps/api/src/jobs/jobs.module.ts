import { Global, Module } from '@nestjs/common';

import { JobsService } from './jobs.service.js';

/** Background jobs (BullMQ on Valkey). Feature modules inject `JobsService`. */
@Global()
@Module({
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
