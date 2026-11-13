import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import { amenitySchema, carMakeSchema } from '@carenta/shared';

import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

class CarMakeListDto extends createZodDto(z.array(carMakeSchema)) {}
class AmenityListDto extends createZodDto(z.array(amenitySchema)) {}

/** Read-only catalogue for the listing form and search filters; managed in Console. */
@ApiTags('Danh mục')
@Public()
@Controller()
export class CatalogController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('car-makes')
  @ApiOperation({ summary: 'Hãng xe và dòng xe', description: 'Chỉ mục đang dùng, theo tên.' })
  @ZodResponse({ status: 200, description: 'Hãng xe kèm dòng xe', type: CarMakeListDto })
  carMakes(): Promise<CarMakeListDto> {
    return this.prisma.carMake.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        models: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
        },
      },
    });
  }

  @Get('amenities')
  @ApiOperation({ summary: 'Tiện nghi', description: 'Chỉ mục đang dùng, theo thứ tự hiển thị.' })
  @ZodResponse({ status: 200, description: 'Tiện nghi', type: AmenityListDto })
  amenities(): Promise<AmenityListDto> {
    return this.prisma.amenity.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    });
  }
}
