import { Module } from '@nestjs/common';

import { CarsModule } from '../cars/cars.module.js';
import { BookingExpiryService } from './booking-expiry.service.js';
import { BookingJobOutboxService } from './booking-job-outbox.service.js';
import { BookingStateMachine } from './booking-state-machine.js';
import { BookingsController, OwnerBookingsController } from './bookings.controllers.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [CarsModule],
  controllers: [BookingsController, OwnerBookingsController],
  providers: [BookingStateMachine, BookingsService, BookingExpiryService, BookingJobOutboxService],
  exports: [BookingStateMachine, BookingsService, BookingExpiryService, BookingJobOutboxService],
})
export class BookingsModule {}
