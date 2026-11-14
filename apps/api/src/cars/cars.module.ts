import { Module } from '@nestjs/common';

import { CarSearchService } from './car-search.service.js';
import { CarsService } from './cars.service.js';
import { CatalogController } from './catalog.controller.js';
import { OwnerCarsController } from './owner-cars.controller.js';
import { PublicCarsController } from './public-cars.controller.js';

/** Car listings managed by owners, public search, and the read-only catalogue (spec §4.1, §5.1). */
@Module({
  controllers: [OwnerCarsController, PublicCarsController, CatalogController],
  providers: [CarsService, CarSearchService],
  exports: [CarsService],
})
export class CarsModule {}
