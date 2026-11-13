import { Global, Module } from '@nestjs/common';

import { StorageService } from './storage.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

/**
 * File storage. Feature modules inject `UploadsService`; `StorageService` is the raw
 * S3 wrapper. `POST /uploads` hands the signed-in user a presigned upload URL.
 */
@Global()
@Module({
  controllers: [UploadsController],
  providers: [StorageService, UploadsService],
  exports: [StorageService, UploadsService],
})
export class StorageModule {}
