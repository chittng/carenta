import { Module } from '@nestjs/common';

import {
  ConsoleDriverLicensesController,
  MyDriverLicenseController,
} from './driver-licenses.controllers.js';
import { DriverLicensesService } from './driver-licenses.service.js';

/** Driver license submission, review and expiry (spec §3, §12.2). */
@Module({
  controllers: [MyDriverLicenseController, ConsoleDriverLicensesController],
  providers: [DriverLicensesService],
  exports: [DriverLicensesService],
})
export class DriverLicensesModule {}
