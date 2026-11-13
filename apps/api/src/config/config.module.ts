import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AppConfigService, validateEnv } from './env.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // Real environment variables win over values from .env.
      envFilePath: '.env',
      validate: validateEnv,
      cache: true,
    }),
  ],
  providers: [{ provide: AppConfigService, useExisting: ConfigService }],
  exports: [AppConfigService],
})
export class AppConfigModule {}
