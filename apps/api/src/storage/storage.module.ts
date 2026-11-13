import { Global, Module } from '@nestjs/common';

import { StorageService } from './storage.service.js';
import { UploadsService } from './uploads.service.js';

/**
 * File storage. Feature modules inject `UploadsService`; `StorageService` is the raw
 * S3 wrapper. The `POST /uploads` endpoint is added with authentication (CARENTA-10),
 * since every upload is tied to the signed-in user.
 */
@Global()
@Module({
  providers: [StorageService, UploadsService],
  exports: [StorageService, UploadsService],
})
export class StorageModule {}
