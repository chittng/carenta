import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module.js';
import {
  OwnerCarAvailabilityController,
  PublicCarAvailabilityController,
} from './car-availability.controllers.js';
import { CarAvailabilityService } from './car-availability.service.js';
import { CarSearchService } from './car-search.service.js';
import { CarsService } from './cars.service.js';
import { CatalogController } from './catalog.controller.js';
import { OwnerCarsController } from './owner-cars.controller.js';
import { PublicCarsController } from './public-cars.controller.js';
import { PublicCarsService } from './public-cars.service.js';

/** Car listings managed by owners, public search, and the read-only catalogue (spec §4.1, §5.1). */
@Module({
  imports: [UsersModule],
  controllers: [
    OwnerCarsController,
    PublicCarsController,
    CatalogController,
    OwnerCarAvailabilityController,
    PublicCarAvailabilityController,
  ],
  providers: [CarsService, CarSearchService, CarAvailabilityService, PublicCarsService],
  exports: [CarsService, CarAvailabilityService],
})
export class CarsModule {}
