import { Module } from '@nestjs/common';

import { CarsService } from './cars.service.js';
import { CatalogController } from './catalog.controller.js';
import { OwnerCarsController } from './owner-cars.controller.js';

/** Car listings managed by owners, and the read-only catalogue (spec §4.1). */
@Module({
  controllers: [OwnerCarsController, CatalogController],
  providers: [CarsService],
  exports: [CarsService],
})
export class CarsModule {}
