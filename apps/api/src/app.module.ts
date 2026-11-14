import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';

import { AuthModule } from './auth/auth.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { CarsModule } from './cars/cars.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { AppConfigModule } from './config/config.module.js';
import { ConsoleModule } from './console/console.module.js';
import { DriverLicensesModule } from './driver-licenses/driver-licenses.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RateLimitModule,
    StorageModule,
    JobsModule,
    MailModule,
    AuthModule,
    CarsModule,
    BookingsModule,
    UsersModule,
    ConsoleModule,
    DriverLicensesModule,
    HealthModule,
  ],
  providers: [
    // Validates @Body/@Query/@Param typed with a createZodDto class.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // Strips and checks responses declared with @ZodResponse.
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
