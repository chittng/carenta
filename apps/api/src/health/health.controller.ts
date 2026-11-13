import { Controller, Get } from '@nestjs/common';

import { APP_TIME_ZONE } from '@carenta/shared';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timeZone: APP_TIME_ZONE };
  }
}
