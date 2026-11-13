import { Body, Controller, Delete, Get, Inject, Param, Patch, Put } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import {
  myProfileSchema,
  publicProfileSchema,
  setAvatarSchema,
  updateProfileSchema,
  userIdParamSchema,
} from '@carenta/shared';

import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { CurrentAuth, Public, type RequestAuth } from '../auth/decorators.js';
import { ErrorResponseDto } from '../docs/api-docs.js';
import { UsersService } from './users.service.js';

class MyProfileDto extends createZodDto(myProfileSchema) {}
class PublicProfileDto extends createZodDto(publicProfileSchema) {}
class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
class SetAvatarDto extends createZodDto(setAvatarSchema) {}
class UserParamsDto extends createZodDto(userIdParamSchema) {}

/** The signed-in user's own profile. Editing it does not need a verified email (spec §3). */
@ApiTags('Hồ sơ')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiUnauthorizedResponse({ description: 'Chưa đăng nhập', type: ErrorResponseDto })
@Controller('me/profile')
export class MyProfileController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Hồ sơ của tôi',
    description: 'Ngày sinh lấy từ GPLX đã nộp. Đổi mật khẩu: `POST /auth/change-password`.',
  })
  @ZodResponse({ status: 200, description: 'Hồ sơ', type: MyProfileDto })
  get(@CurrentAuth() auth: RequestAuth): Promise<MyProfileDto> {
    return this.users.getMine(auth.user.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Sửa hồ sơ',
    description: [
      'Chỉ gửi các trường cần đổi.',
      '`phone`: số di động Việt Nam, tự chuẩn hoá về dạng `0912345678`; gửi `null` hoặc chuỗi rỗng để xoá. Không cần xác minh.',
    ].join('\n'),
  })
  @ZodResponse({ status: 200, description: 'Hồ sơ sau khi sửa', type: MyProfileDto })
  update(@CurrentAuth() auth: RequestAuth, @Body() body: UpdateProfileDto): Promise<MyProfileDto> {
    return this.users.updateMine(auth.user.id, body);
  }

  @Put('avatar')
  @ApiOperation({
    summary: 'Đổi ảnh đại diện',
    description:
      'Gửi `uploadKey` từ `POST /uploads` (purpose `AVATAR`) sau khi đã tải ảnh lên. Ảnh được cắt vuông 256×256.',
  })
  @ZodResponse({ status: 200, description: 'Hồ sơ với ảnh mới', type: MyProfileDto })
  @ApiNotFoundResponse({ description: 'UPLOAD_NOT_FOUND', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'UPLOAD_INVALID_FILE', type: ErrorResponseDto })
  setAvatar(@CurrentAuth() auth: RequestAuth, @Body() body: SetAvatarDto): Promise<MyProfileDto> {
    return this.users.setAvatar(auth.user.id, body.uploadKey);
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Xoá ảnh đại diện' })
  @ZodResponse({ status: 200, description: 'Hồ sơ không còn ảnh', type: MyProfileDto })
  removeAvatar(@CurrentAuth() auth: RequestAuth): Promise<MyProfileDto> {
    return this.users.removeAvatar(auth.user.id);
  }
}

/** Public profiles, shown on `/nguoi-dung/[id]` and next to a car. */
@ApiTags('Hồ sơ')
@Public()
@Controller('users')
export class PublicProfileController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Hồ sơ công khai',
    description: [
      'Không có email, số điện thoại, ngày sinh.',
      '`tripCount`: chuyến đã hoàn tất, cả khi thuê và khi cho thuê. `rating`: đánh giá đã công bố mà người này nhận được.',
      '`responseRate`: % yêu cầu đặt xe (duyệt tay) trong 90 ngày gần nhất được chủ xe trả lời trước khi hết hạn; `null` nếu chưa có yêu cầu.',
    ].join('\n'),
  })
  @ZodResponse({ status: 200, description: 'Hồ sơ công khai', type: PublicProfileDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy người dùng', type: ErrorResponseDto })
  get(@Param() params: UserParamsDto): Promise<PublicProfileDto> {
    return this.users.getPublic(params.id);
  }
}
