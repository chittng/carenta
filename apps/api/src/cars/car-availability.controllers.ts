import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import {
  availabilityBlockInputSchema,
  availabilityBlockSchema,
  availabilityMonthQuerySchema,
  carAvailabilitySchema,
} from '@carenta/shared';

import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { CurrentAuth, Public, type RequestAuth, RequireVerifiedEmail } from '../auth/decorators.js';
import { ErrorResponseDto } from '../docs/api-docs.js';
import { CarAvailabilityService } from './car-availability.service.js';

class CarParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}
class BlockParamsDto extends createZodDto(z.object({ id: z.uuid(), blockId: z.uuid() })) {}
class MonthQueryDto extends createZodDto(availabilityMonthQuerySchema) {}
class BlockInputDto extends createZodDto(availabilityBlockInputSchema) {}
class BlockDto extends createZodDto(availabilityBlockSchema) {}
class BlocksDto extends createZodDto(z.array(availabilityBlockSchema)) {}
class CalendarDto extends createZodDto(carAvailabilitySchema) {}

@ApiTags('Lịch xe của tôi')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiNotFoundResponse({
  description: 'Không tìm thấy xe hoặc khoảng chặn lịch (hoặc xe không phải của bạn).',
  type: ErrorResponseDto,
})
@ApiForbiddenResponse({ description: 'EMAIL_NOT_VERIFIED', type: ErrorResponseDto })
@RequireVerifiedEmail()
@Controller('owner/cars/:id')
export class OwnerCarAvailabilityController {
  constructor(
    @Inject(CarAvailabilityService) private readonly availability: CarAvailabilityService,
  ) {}

  @Get('availability-blocks')
  @ApiOperation({
    summary: 'Các khoảng tự chặn trong tháng',
    description:
      '`month`: YYYY-MM, theo giờ Việt Nam. Trả khoảng có giao với tháng, giữ nguyên giờ bắt đầu/kết thúc và lý do riêng tư.',
  })
  @ZodResponse({
    status: 200,
    description: 'Các khoảng chặn, sắp theo giờ bắt đầu',
    type: BlocksDto,
  })
  list(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: CarParamsDto,
    @Query() query: MonthQueryDto,
  ): Promise<BlocksDto> {
    return this.availability.listBlocks(auth.user.id, params.id, query.month);
  }

  @Post('availability-blocks')
  @ApiOperation({
    summary: 'Chặn lịch xe',
    description:
      'Giờ bắt đầu/kết thúc theo bước 30 phút. Các khoảng tự chặn được trùng nhau; không được trùng đơn đang chiếm lịch, kể cả thời gian đệm. Khoảng tự chặn không cộng đệm.',
  })
  @ZodResponse({ status: 201, description: 'Khoảng vừa chặn', type: BlockDto })
  @ApiConflictResponse({
    description: 'AVAILABILITY_BOOKING_CONFLICT; CAR_STATUS_CONFLICT',
    type: ErrorResponseDto,
  })
  create(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: CarParamsDto,
    @Body() body: BlockInputDto,
  ): Promise<BlockDto> {
    return this.availability.createBlock(auth.user.id, params.id, body);
  }

  @Put('availability-blocks/:blockId')
  @ApiOperation({
    summary: 'Thay khoảng chặn lịch',
    description:
      'Thay toàn bộ giờ bắt đầu/kết thúc và lý do. Bỏ lý do hoặc gửi null để xoá lý do. Kiểm tra trùng đơn như khi tạo.',
  })
  @ZodResponse({ status: 200, description: 'Khoảng chặn sau khi sửa', type: BlockDto })
  @ApiConflictResponse({
    description: 'AVAILABILITY_BOOKING_CONFLICT; CAR_STATUS_CONFLICT',
    type: ErrorResponseDto,
  })
  replace(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: BlockParamsDto,
    @Body() body: BlockInputDto,
  ): Promise<BlockDto> {
    return this.availability.replaceBlock(auth.user.id, params.id, params.blockId, body);
  }

  @Delete('availability-blocks/:blockId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bỏ chặn lịch xe' })
  @ApiNoContentResponse({ description: 'Đã bỏ khoảng chặn' })
  @ApiConflictResponse({ description: 'CAR_STATUS_CONFLICT', type: ErrorResponseDto })
  remove(@CurrentAuth() auth: RequestAuth, @Param() params: BlockParamsDto): Promise<void> {
    return this.availability.removeBlock(auth.user.id, params.id, params.blockId);
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Lịch bận xe của tôi',
    description:
      '`month`: YYYY-MM theo giờ Việt Nam. Gồm chặn tay và đơn chiếm lịch với đệm đã chốt, gộp và cắt theo tháng. Xem được cả xe chưa công khai.',
  })
  @ZodResponse({ status: 200, description: 'Các khoảng bận trong tháng', type: CalendarDto })
  calendar(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: CarParamsDto,
    @Query() query: MonthQueryDto,
  ): Promise<CalendarDto> {
    return this.availability.ownerCalendar(auth.user.id, params.id, query.month);
  }
}

@ApiTags('Lịch trống')
@Public()
@Controller('cars/:id/availability')
export class PublicCarAvailabilityController {
  constructor(
    @Inject(CarAvailabilityService) private readonly availability: CarAvailabilityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Xem lịch bận của xe',
    description:
      '`month`: YYYY-MM theo giờ Việt Nam. Chỉ xe đang hiển thị. Khoảng bận [startAt, endAt) gồm chặn tay và đơn CHỜ THANH TOÁN / ĐÃ XÁC NHẬN / ĐANG THUÊ (cộng đệm đã chốt). Các khoảng trùng hoặc tiếp giáp được gộp và cắt theo tháng; không có lý do chặn hay thông tin đơn. Khi chọn chuyến trước một đơn khác, vẫn phải chừa đệm sau chuyến mới; tìm kiếm và tạo đơn sẽ kiểm tra lại.',
  })
  @ZodResponse({ status: 200, description: 'Các khoảng bận trong tháng', type: CalendarDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy xe đang hiển thị.', type: ErrorResponseDto })
  calendar(@Param() params: CarParamsDto, @Query() query: MonthQueryDto): Promise<CalendarDto> {
    return this.availability.publicCalendar(params.id, query.month);
  }
}
