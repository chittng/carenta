import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import {
  addCarPhotoSchema,
  carDocumentTypeParamSchema,
  createCarSchema,
  ownerCarSchema,
  ownerCarSummarySchema,
  putCarDocumentSchema,
  reorderCarPhotosSchema,
  updateCarSchema,
} from '@carenta/shared';

import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { CurrentAuth, type RequestAuth, RequireVerifiedEmail } from '../auth/decorators.js';
import { ErrorResponseDto } from '../docs/api-docs.js';
import { CarsService } from './cars.service.js';

class CreateCarDto extends createZodDto(createCarSchema) {}
class UpdateCarDto extends createZodDto(updateCarSchema) {}
class AddCarPhotoDto extends createZodDto(addCarPhotoSchema) {}
class ReorderCarPhotosDto extends createZodDto(reorderCarPhotosSchema) {}
class PutCarDocumentDto extends createZodDto(putCarDocumentSchema) {}
class OwnerCarDto extends createZodDto(ownerCarSchema) {}
class OwnerCarSummaryListDto extends createZodDto(z.array(ownerCarSummarySchema)) {}
class CarParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}
class CarPhotoParamsDto extends createZodDto(z.object({ id: z.uuid(), photoId: z.uuid() })) {}
class CarDocumentParamsDto extends createZodDto(carDocumentTypeParamSchema) {}

const NOT_FOUND = { description: 'Không tìm thấy xe (hoặc xe không phải của bạn)' };
const REMOVED = 'CAR_STATUS_CONFLICT: xe đã bị admin gỡ, không sửa được';

/**
 * Cars managed by their owner (spec §4.1, §12.3). Listing a car needs a verified email.
 * Public car pages and search are separate (`/cars`, CARENTA-23/24).
 */
@ApiTags('Xe của tôi')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiForbiddenResponse({ description: 'EMAIL_NOT_VERIFIED', type: ErrorResponseDto })
@RequireVerifiedEmail()
@Controller('owner/cars')
export class OwnerCarsController {
  constructor(@Inject(CarsService) private readonly cars: CarsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách xe của tôi', description: 'Mới tạo trước.' })
  @ZodResponse({ status: 200, description: 'Xe của người dùng', type: OwnerCarSummaryListDto })
  list(@CurrentAuth() auth: RequestAuth): Promise<OwnerCarSummaryListDto> {
    return this.cars.list(auth.user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Tạo xe (lưu nháp)',
    description:
      'Bước đầu của đăng xe: cần đủ thông tin cơ bản và địa chỉ. Ảnh, giấy tờ thêm ở các bước sau, rồi gọi `submit` để gửi duyệt.',
  })
  @ZodResponse({ status: 201, description: 'Xe nháp vừa tạo', type: OwnerCarDto })
  @ApiConflictResponse({ description: 'LICENSE_PLATE_TAKEN', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'CATALOG_ITEM_NOT_FOUND', type: ErrorResponseDto })
  create(@CurrentAuth() auth: RequestAuth, @Body() body: CreateCarDto): Promise<OwnerCarDto> {
    return this.cars.create(auth.user.id, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết xe của tôi', description: 'Link giấy tờ hiệu lực 5 phút.' })
  @ZodResponse({ status: 200, description: 'Xe', type: OwnerCarDto })
  @ApiNotFoundResponse({ ...NOT_FOUND, type: ErrorResponseDto })
  get(@CurrentAuth() auth: RequestAuth, @Param() params: CarParamsDto): Promise<OwnerCarDto> {
    return this.cars.get(auth.user.id, params.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Sửa thông tin xe',
    description: [
      'Chỉ gửi các trường cần đổi; `rules`, `mileageLimit`, `location`, `amenityIds` được thay cả cụm.',
      '',
      'Xe chưa từng được duyệt: mọi thay đổi áp dụng ngay.',
      'Xe đã duyệt: `licensePlate`, `modelId`, `year` vào bản chờ admin duyệt lại (`revision`), xe vẫn hiển thị thông tin cũ; sửa tiếp thì ghi đè bản chờ. Các trường khác áp dụng ngay.',
    ].join('\n'),
  })
  @ZodResponse({ status: 200, description: 'Xe sau khi sửa', type: OwnerCarDto })
  @ApiNotFoundResponse({ ...NOT_FOUND, type: ErrorResponseDto })
  @ApiConflictResponse({ description: `LICENSE_PLATE_TAKEN; ${REMOVED}`, type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'CATALOG_ITEM_NOT_FOUND', type: ErrorResponseDto })
  update(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: CarParamsDto,
    @Body() body: UpdateCarDto,
  ): Promise<OwnerCarDto> {
    return this.cars.update(auth.user.id, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xoá xe',
    description: 'Chỉ xoá được xe nháp hoặc bị từ chối. Xe đã từng được duyệt chỉ tạm ngưng được.',
  })
  @ApiNoContentResponse({ description: 'Đã xoá xe cùng ảnh và giấy tờ' })
  @ApiNotFoundResponse({ ...NOT_FOUND, type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'CAR_STATUS_CONFLICT', type: ErrorResponseDto })
  async remove(@CurrentAuth() auth: RequestAuth, @Param() params: CarParamsDto): Promise<void> {
    await this.cars.remove(auth.user.id, params.id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gửi duyệt',
    description:
      'Xe nháp hoặc bị từ chối → chờ duyệt. Cần 4–15 ảnh, giấy đăng ký và giấy đăng kiểm còn hạn; thiếu thì trả `CAR_INCOMPLETE` kèm `details`.',
  })
  @ZodResponse({ status: 200, description: 'Xe đang chờ duyệt', type: OwnerCarDto })
  @ApiNotFoundResponse({ ...NOT_FOUND, type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'CAR_STATUS_CONFLICT', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'CAR_INCOMPLETE', type: ErrorResponseDto })
  submit(@CurrentAuth() auth: RequestAuth, @Param() params: CarParamsDto): Promise<OwnerCarDto> {
    return this.cars.submit(auth.user.id, params.id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tạm ngưng cho thuê',
    description: 'Ẩn xe khỏi tìm kiếm. Các đơn đã xác nhận vẫn giữ nguyên.',
  })
  @ZodResponse({ status: 200, description: 'Xe đã tạm ngưng', type: OwnerCarDto })
  @ApiNotFoundResponse({ ...NOT_FOUND, type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'CAR_STATUS_CONFLICT', type: ErrorResponseDto })
  pause(@CurrentAuth() auth: RequestAuth, @Param() params: CarParamsDto): Promise<OwnerCarDto> {
    return this.cars.pause(auth.user.id, params.id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cho thuê lại', description: 'Xe tạm ngưng hiển thị lại.' })
  @ZodResponse({ status: 200, description: 'Xe đang hiển thị', type: OwnerCarDto })
  @ApiNotFoundResponse({ ...NOT_FOUND, type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'CAR_STATUS_CONFLICT', type: ErrorResponseDto })
  resume(@CurrentAuth() auth: RequestAuth, @Param() params: CarParamsDto): Promise<OwnerCarDto> {
    return this.cars.resume(auth.user.id, params.id);
  }

  @Post(':id/photos')
  @ApiOperation({
    summary: 'Thêm ảnh xe',
    description:
      'Gửi `uploadKey` lấy từ `POST /uploads` (purpose `CAR_PHOTO`) sau khi đã tải ảnh lên. Ảnh được thêm vào cuối. Tối đa 15 ảnh; không cần duyệt lại.',
  })
  @ZodResponse({ status: 201, description: 'Xe sau khi thêm ảnh', type: OwnerCarDto })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy xe; UPLOAD_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({ description: `CAR_PHOTO_LIMIT; ${REMOVED}`, type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'UPLOAD_INVALID_FILE', type: ErrorResponseDto })
  addPhoto(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: CarParamsDto,
    @Body() body: AddCarPhotoDto,
  ): Promise<OwnerCarDto> {
    return this.cars.addPhoto(auth.user.id, params.id, body.uploadKey);
  }

  @Put(':id/photos/order')
  @ApiOperation({
    summary: 'Sắp xếp ảnh',
    description: 'Gửi id của tất cả ảnh theo thứ tự mới; ảnh đầu tiên là ảnh bìa.',
  })
  @ZodResponse({ status: 200, description: 'Xe sau khi sắp xếp', type: OwnerCarDto })
  @ApiNotFoundResponse({ ...NOT_FOUND, type: ErrorResponseDto })
  reorderPhotos(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: CarParamsDto,
    @Body() body: ReorderCarPhotosDto,
  ): Promise<OwnerCarDto> {
    return this.cars.reorderPhotos(auth.user.id, params.id, body);
  }

  @Delete(':id/photos/:photoId')
  @ApiOperation({
    summary: 'Xoá ảnh xe',
    description: 'Xe đã duyệt phải giữ ít nhất 4 ảnh. Các ảnh sau được dồn lên.',
  })
  @ZodResponse({ status: 200, description: 'Xe sau khi xoá ảnh', type: OwnerCarDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy xe hoặc ảnh', type: ErrorResponseDto })
  @ApiConflictResponse({ description: `CAR_PHOTO_LIMIT; ${REMOVED}`, type: ErrorResponseDto })
  removePhoto(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: CarPhotoParamsDto,
  ): Promise<OwnerCarDto> {
    return this.cars.removePhoto(auth.user.id, params.id, params.photoId);
  }

  @Put(':id/documents/:type')
  @ApiOperation({
    summary: 'Tải lên giấy tờ xe',
    description: [
      '`type`: `REGISTRATION` (giấy đăng ký) hoặc `INSPECTION` (giấy đăng kiểm, bắt buộc `expiresOn` từ hôm nay trở đi).',
      'Gửi `uploadKey` từ `POST /uploads` (purpose `CAR_DOCUMENT`). Giấy tờ chỉ chủ xe và admin xem được.',
      '',
      'Xe chưa từng được duyệt: thay giấy tờ hiện tại. Xe đã duyệt: vào bản chờ admin duyệt lại.',
    ].join('\n'),
  })
  @ZodResponse({ status: 200, description: 'Xe sau khi tải giấy tờ', type: OwnerCarDto })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy xe; UPLOAD_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({ description: REMOVED, type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'UPLOAD_INVALID_FILE', type: ErrorResponseDto })
  putDocument(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: CarDocumentParamsDto,
    @Body() body: PutCarDocumentDto,
  ): Promise<OwnerCarDto> {
    return this.cars.putDocument(auth.user.id, params.id, params.type, body);
  }

  @Delete(':id/revision')
  @ApiOperation({
    summary: 'Huỷ thay đổi đang chờ duyệt',
    description: 'Bỏ bản sửa biển số, hãng/dòng/năm, giấy tờ đang chờ admin duyệt.',
  })
  @ZodResponse({ status: 200, description: 'Xe sau khi huỷ bản sửa', type: OwnerCarDto })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy xe, hoặc không có bản sửa đang chờ',
    type: ErrorResponseDto,
  })
  cancelRevision(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: CarParamsDto,
  ): Promise<OwnerCarDto> {
    return this.cars.cancelRevision(auth.user.id, params.id);
  }
}
