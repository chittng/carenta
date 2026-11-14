import {
  Body,
  Controller,
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
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import {
  consoleDriverLicenseListQuerySchema,
  consoleDriverLicenseSchema,
  consoleDriverLicenseSummarySchema,
  moderationReasonSchema,
  myDriverLicensesSchema,
  pageOf,
  submitDriverLicenseSchema,
} from '@carenta/shared';

import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { CurrentAuth, type RequestAuth, RequireVerifiedEmail, Roles } from '../auth/decorators.js';
import { ErrorResponseDto } from '../docs/api-docs.js';
import { DriverLicensesService } from './driver-licenses.service.js';

class MyDriverLicensesDto extends createZodDto(myDriverLicensesSchema) {}
class SubmitDriverLicenseDto extends createZodDto(submitDriverLicenseSchema) {}
class ListQueryDto extends createZodDto(consoleDriverLicenseListQuerySchema) {}
class LicensePageDto extends createZodDto(pageOf(consoleDriverLicenseSummarySchema)) {}
class ConsoleDriverLicenseDto extends createZodDto(consoleDriverLicenseSchema) {}
class ReasonDto extends createZodDto(moderationReasonSchema) {}
class LicenseParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}

/** The signed-in user's driver license (spec §3). */
@ApiTags('GPLX')
@ApiCookieAuth(ACCESS_COOKIE)
@Controller('me/driver-license')
export class MyDriverLicenseController {
  constructor(@Inject(DriverLicensesService) private readonly licenses: DriverLicensesService) {}

  @Get()
  @ApiOperation({
    summary: 'GPLX của tôi',
    description:
      '`current`: GPLX đang dùng để thuê xe (đã duyệt hoặc đã hết hạn). `submission`: GPLX mới nộp đang chờ duyệt hoặc bị từ chối. Link ảnh hiệu lực 5 phút.',
  })
  @ZodResponse({ status: 200, description: 'GPLX', type: MyDriverLicensesDto })
  get(@CurrentAuth() auth: RequestAuth): Promise<MyDriverLicensesDto> {
    return this.licenses.getMine(auth.user.id);
  }

  @Put()
  @RequireVerifiedEmail()
  @ApiOperation({
    summary: 'Nộp GPLX',
    description: [
      'Gửi `frontUploadKey`, `backUploadKey` từ `POST /uploads` (purpose `DRIVER_LICENSE`) cùng thông tin trên GPLX. Ảnh chỉ người nộp và admin xem được.',
      'Thay bản đang chờ hoặc bị từ chối. GPLX đã duyệt vẫn dùng được cho tới khi bản mới được duyệt.',
    ].join('\n'),
  })
  @ZodResponse({ status: 200, description: 'GPLX sau khi nộp', type: MyDriverLicensesDto })
  @ApiForbiddenResponse({ description: 'EMAIL_NOT_VERIFIED', type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: 'UPLOAD_NOT_FOUND', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'DRIVER_LICENSE_TAKEN', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'UPLOAD_INVALID_FILE', type: ErrorResponseDto })
  submit(
    @CurrentAuth() auth: RequestAuth,
    @Body() body: SubmitDriverLicenseDto,
  ): Promise<MyDriverLicensesDto> {
    return this.licenses.submit(auth.user.id, body);
  }
}

/** License review in Console (spec §11). Results are emailed to the holder. */
@ApiTags('Console: GPLX')
@ApiForbiddenResponse({ description: 'Không phải admin', type: ErrorResponseDto })
@Roles('ADMIN')
@Controller('console/driver-licenses')
export class ConsoleDriverLicensesController {
  constructor(@Inject(DriverLicensesService) private readonly licenses: DriverLicensesService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách GPLX',
    description:
      'Mặc định là hàng đợi chờ duyệt, nộp sớm nhất lên trước. `isRenewal`: người dùng đã có GPLX được duyệt.',
  })
  @ZodResponse({ status: 200, description: 'Một trang GPLX', type: LicensePageDto })
  list(@Query() query: ListQueryDto): Promise<LicensePageDto> {
    return this.licenses.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết GPLX',
    description:
      'Kèm ảnh hai mặt (link hiệu lực 5 phút) và GPLX đang dùng của người này để so sánh.',
  })
  @ZodResponse({ status: 200, description: 'GPLX', type: ConsoleDriverLicenseDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy GPLX', type: ErrorResponseDto })
  get(@Param() params: LicenseParamsDto): Promise<ConsoleDriverLicenseDto> {
    return this.licenses.get(params.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Duyệt GPLX',
    description: 'Thay GPLX cũ của người này (nếu có). Hệ thống nhắc 30 ngày trước khi hết hạn.',
  })
  @ZodResponse({ status: 200, description: 'GPLX đã duyệt', type: ConsoleDriverLicenseDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy GPLX', type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'DRIVER_LICENSE_STATUS_CONFLICT: không chờ duyệt, hoặc đã hết hạn',
    type: ErrorResponseDto,
  })
  approve(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: LicenseParamsDto,
  ): Promise<ConsoleDriverLicenseDto> {
    return this.licenses.approve(auth.user.id, params.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Từ chối GPLX',
    description: 'Người dùng thấy lý do và nộp lại. GPLX đã duyệt trước đó (nếu có) vẫn dùng được.',
  })
  @ZodResponse({ status: 200, description: 'GPLX bị từ chối', type: ConsoleDriverLicenseDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy GPLX', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'DRIVER_LICENSE_STATUS_CONFLICT', type: ErrorResponseDto })
  reject(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: LicenseParamsDto,
    @Body() body: ReasonDto,
  ): Promise<ConsoleDriverLicenseDto> {
    return this.licenses.reject(auth.user.id, params.id, body.reason);
  }
}
