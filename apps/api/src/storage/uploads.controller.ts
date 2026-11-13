import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { createUploadSchema, uploadTicketSchema } from '@carenta/shared';

import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { CurrentAuth, type RequestAuth } from '../auth/decorators.js';
import { UploadsService } from './uploads.service.js';

class CreateUploadDto extends createZodDto(createUploadSchema) {}
class UploadTicketDto extends createZodDto(uploadTicketSchema) {}

@ApiTags('Tải ảnh')
@ApiCookieAuth(ACCESS_COOKIE)
@Controller('uploads')
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post()
  @ApiOperation({
    summary: 'Xin link tải ảnh lên',
    description:
      'Trình duyệt PUT ảnh lên `uploadUrl` với đúng `headers` trả về (link hiệu lực 10 phút), rồi gửi `key` cho endpoint của tính năng (ví dụ thêm ảnh xe). Chỉ nhận JPG, PNG, WebP, tối đa 10 MB.',
  })
  @ZodResponse({ status: 201, description: 'Link tải lên', type: UploadTicketDto })
  create(
    @CurrentAuth() auth: RequestAuth,
    @Body() body: CreateUploadDto,
  ): Promise<UploadTicketDto> {
    return this.uploads.createUpload(auth.user.id, body);
  }
}
