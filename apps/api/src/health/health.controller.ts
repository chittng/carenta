import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import { APP_TIME_ZONE } from '@carenta/shared';

import { Public } from '../auth/decorators.js';

const healthSchema = z.object({
  status: z.literal('ok'),
  timeZone: z.string(),
});

class HealthDto extends createZodDto(healthSchema) {}

@ApiTags('Hệ thống')
@Public()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Kiểm tra API còn hoạt động' })
  @ZodResponse({ status: 200, description: 'API đang hoạt động', type: HealthDto })
  check(): HealthDto {
    return { status: 'ok', timeZone: APP_TIME_ZONE };
  }
}
