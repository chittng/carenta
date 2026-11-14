import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { ConsoleCarsService } from './console-cars.service.js';
import { ConsoleCatalogService } from './console-catalog.service.js';
import { ConsoleUsersService } from './console-users.service.js';
import {
  ConsoleCarsController,
  ConsoleCatalogController,
  ConsoleUsersController,
} from './console.controllers.js';

/** Admin-only API behind Console (spec §11). */
@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [ConsoleCarsController, ConsoleUsersController, ConsoleCatalogController],
  providers: [ConsoleCarsService, ConsoleUsersService, ConsoleCatalogService],
})
export class ConsoleModule {}
