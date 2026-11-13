import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import {
  consoleAmenitySchema,
  consoleCarListQuerySchema,
  consoleCarMakeSchema,
  consoleCarModelSchema,
  consoleCarSchema,
  consoleCarSummarySchema,
  consoleRevisionSummarySchema,
  consoleUserListQuerySchema,
  consoleUserSchema,
  consoleUserSummarySchema,
  createAmenitySchema,
  createCatalogItemSchema,
  intIdParamSchema,
  moderationReasonSchema,
  pageOf,
  paginationQuerySchema,
  updateAmenitySchema,
  updateCatalogItemSchema,
} from '@carenta/shared';

import { CurrentAuth, type RequestAuth, Roles } from '../auth/decorators.js';
import { ErrorResponseDto } from '../docs/api-docs.js';
import { ConsoleCarsService } from './console-cars.service.js';
import { ConsoleCatalogService } from './console-catalog.service.js';
import { ConsoleUsersService } from './console-users.service.js';

class UuidParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}
class IntParamsDto extends createZodDto(intIdParamSchema) {}
class ReasonDto extends createZodDto(moderationReasonSchema) {}
class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}

class CarListQueryDto extends createZodDto(consoleCarListQuerySchema) {}
class CarPageDto extends createZodDto(pageOf(consoleCarSummarySchema)) {}
class RevisionPageDto extends createZodDto(pageOf(consoleRevisionSummarySchema)) {}
class ConsoleCarDto extends createZodDto(consoleCarSchema) {}

class UserListQueryDto extends createZodDto(consoleUserListQuerySchema) {}
class UserPageDto extends createZodDto(pageOf(consoleUserSummarySchema)) {}
class ConsoleUserDto extends createZodDto(consoleUserSchema) {}

class CarMakeListDto extends createZodDto(z.array(consoleCarMakeSchema)) {}
class CarMakeDto extends createZodDto(consoleCarMakeSchema) {}
class CarModelDto extends createZodDto(consoleCarModelSchema) {}
class AmenityListDto extends createZodDto(z.array(consoleAmenitySchema)) {}
class AmenityDto extends createZodDto(consoleAmenitySchema) {}
class CreateCatalogItemDto extends createZodDto(createCatalogItemSchema) {}
class UpdateCatalogItemDto extends createZodDto(updateCatalogItemSchema) {}
class CreateAmenityDto extends createZodDto(createAmenitySchema) {}
class UpdateAmenityDto extends createZodDto(updateAmenitySchema) {}

const NOT_ADMIN = { description: 'Không phải admin', type: ErrorResponseDto };
const CAR_NOT_FOUND = { description: 'Không tìm thấy xe', type: ErrorResponseDto };
const STATUS_CONFLICT = {
  description: 'CAR_STATUS_CONFLICT: xe không ở trạng thái phù hợp',
  type: ErrorResponseDto,
};

/** Car review (spec §11, §12.3). Every decision is emailed to the owner. */
@ApiTags('Console: xe')
@ApiForbiddenResponse(NOT_ADMIN)
@Roles('ADMIN')
@Controller('console')
export class ConsoleCarsController {
  constructor(@Inject(ConsoleCarsService) private readonly cars: ConsoleCarsService) {}

  @Get('cars')
  @ApiOperation({
    summary: 'Danh sách xe',
    description:
      '`status=PENDING_REVIEW` là hàng đợi xe mới, xe gửi duyệt sớm nhất lên trước; các trường hợp khác xe mới tạo lên trước. `q` tìm theo biển số, tên hoặc email chủ xe.',
  })
  @ZodResponse({ status: 200, description: 'Một trang xe', type: CarPageDto })
  list(@Query() query: CarListQueryDto): Promise<CarPageDto> {
    return this.cars.list(query);
  }

  @Get('car-revisions')
  @ApiOperation({
    summary: 'Hàng đợi thay đổi chờ duyệt',
    description: 'Thay đổi biển số, hãng/dòng/năm, giấy tờ của xe đã duyệt; cũ nhất lên trước.',
  })
  @ZodResponse({ status: 200, description: 'Một trang thay đổi', type: RevisionPageDto })
  listRevisions(@Query() query: PaginationQueryDto): Promise<RevisionPageDto> {
    return this.cars.listRevisions(query.page, query.pageSize);
  }

  @Get('cars/:id')
  @ApiOperation({
    summary: 'Chi tiết xe',
    description: 'Kèm giấy tờ (link hiệu lực 5 phút), chủ xe và thay đổi đang chờ duyệt.',
  })
  @ZodResponse({ status: 200, description: 'Xe', type: ConsoleCarDto })
  @ApiNotFoundResponse(CAR_NOT_FOUND)
  get(@Param() params: UuidParamsDto): Promise<ConsoleCarDto> {
    return this.cars.get(params.id);
  }

  @Post('cars/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Duyệt xe mới',
    description:
      'Xe chờ duyệt → đang hiển thị. Kiểm tra lại ảnh, bảng giá, giấy tờ vì chủ xe vẫn sửa được trong lúc chờ.',
  })
  @ZodResponse({ status: 200, description: 'Xe đã duyệt', type: ConsoleCarDto })
  @ApiNotFoundResponse(CAR_NOT_FOUND)
  @ApiConflictResponse(STATUS_CONFLICT)
  @ApiUnprocessableEntityResponse({ description: 'CAR_INCOMPLETE', type: ErrorResponseDto })
  approve(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: UuidParamsDto,
  ): Promise<ConsoleCarDto> {
    return this.cars.approve(auth.user.id, params.id);
  }

  @Post('cars/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Từ chối xe mới',
    description: 'Xe chờ duyệt → bị từ chối. Chủ xe thấy lý do, sửa rồi gửi duyệt lại.',
  })
  @ZodResponse({ status: 200, description: 'Xe bị từ chối', type: ConsoleCarDto })
  @ApiNotFoundResponse(CAR_NOT_FOUND)
  @ApiConflictResponse(STATUS_CONFLICT)
  reject(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: UuidParamsDto,
    @Body() body: ReasonDto,
  ): Promise<ConsoleCarDto> {
    return this.cars.reject(auth.user.id, params.id, body.reason);
  }

  @Post('cars/:id/revision/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Duyệt thay đổi',
    description: 'Áp dụng biển số, hãng/dòng/năm và giấy tờ mới (thay giấy tờ cũ cùng loại).',
  })
  @ZodResponse({ status: 200, description: 'Xe sau khi áp dụng', type: ConsoleCarDto })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy xe, hoặc không có thay đổi chờ duyệt',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({ description: 'LICENSE_PLATE_TAKEN', type: ErrorResponseDto })
  approveRevision(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: UuidParamsDto,
  ): Promise<ConsoleCarDto> {
    return this.cars.approveRevision(auth.user.id, params.id);
  }

  @Post('cars/:id/revision/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Từ chối thay đổi',
    description: 'Bỏ thay đổi, xe giữ thông tin cũ; chủ xe thấy lý do.',
  })
  @ZodResponse({ status: 200, description: 'Xe', type: ConsoleCarDto })
  @ApiNotFoundResponse({
    description: 'Không tìm thấy xe, hoặc không có thay đổi chờ duyệt',
    type: ErrorResponseDto,
  })
  rejectRevision(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: UuidParamsDto,
    @Body() body: ReasonDto,
  ): Promise<ConsoleCarDto> {
    return this.cars.rejectRevision(auth.user.id, params.id, body.reason);
  }

  @Post('cars/:id/hide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ẩn xe',
    description:
      'Xe đang hiển thị hoặc tạm ngưng → bị ẩn khỏi tìm kiếm. Bỏ ẩn được; chủ xe vẫn sửa được. Chuyến đã xác nhận giữ nguyên.',
  })
  @ZodResponse({ status: 200, description: 'Xe bị ẩn', type: ConsoleCarDto })
  @ApiNotFoundResponse(CAR_NOT_FOUND)
  @ApiConflictResponse(STATUS_CONFLICT)
  hide(@Param() params: UuidParamsDto, @Body() body: ReasonDto): Promise<ConsoleCarDto> {
    return this.cars.hide(params.id, body.reason);
  }

  @Post('cars/:id/unhide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bỏ ẩn xe', description: 'Xe bị ẩn → đang hiển thị.' })
  @ZodResponse({ status: 200, description: 'Xe hiển thị lại', type: ConsoleCarDto })
  @ApiNotFoundResponse(CAR_NOT_FOUND)
  @ApiConflictResponse(STATUS_CONFLICT)
  unhide(@Param() params: UuidParamsDto): Promise<ConsoleCarDto> {
    return this.cars.unhide(params.id);
  }

  @Post('cars/:id/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gỡ xe',
    description:
      'Xe đã duyệt → bị gỡ vĩnh viễn: không khôi phục, chủ xe không sửa được. Thay đổi đang chờ bị bỏ; chuyến đã xác nhận giữ nguyên.',
  })
  @ZodResponse({ status: 200, description: 'Xe bị gỡ', type: ConsoleCarDto })
  @ApiNotFoundResponse(CAR_NOT_FOUND)
  @ApiConflictResponse(STATUS_CONFLICT)
  remove(@Param() params: UuidParamsDto, @Body() body: ReasonDto): Promise<ConsoleCarDto> {
    return this.cars.remove(params.id, body.reason);
  }
}

/** Users (spec §11). Locking ends every session and emails the user. */
@ApiTags('Console: người dùng')
@ApiForbiddenResponse(NOT_ADMIN)
@Roles('ADMIN')
@Controller('console/users')
export class ConsoleUsersController {
  constructor(@Inject(ConsoleUsersService) private readonly users: ConsoleUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách người dùng',
    description: 'Mới đăng ký lên trước. `q` tìm theo tên, email hoặc số điện thoại.',
  })
  @ZodResponse({ status: 200, description: 'Một trang người dùng', type: UserPageDto })
  list(@Query() query: UserListQueryDto): Promise<UserPageDto> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết người dùng' })
  @ZodResponse({ status: 200, description: 'Người dùng', type: ConsoleUserDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy người dùng', type: ErrorResponseDto })
  get(@Param() params: UuidParamsDto): Promise<ConsoleUserDto> {
    return this.users.get(params.id);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khoá tài khoản',
    description:
      'Đăng xuất mọi thiết bị ngay, gửi email kèm lý do. Không khoá được tài khoản admin. Xe của người này không còn xuất hiện trong tìm kiếm.',
  })
  @ZodResponse({ status: 200, description: 'Người dùng đã bị khoá', type: ConsoleUserDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy người dùng', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'USER_STATUS_CONFLICT', type: ErrorResponseDto })
  lock(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: UuidParamsDto,
    @Body() body: ReasonDto,
  ): Promise<ConsoleUserDto> {
    return this.users.lock(auth.user.id, params.id, body.reason);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mở khoá tài khoản', description: 'Gửi email báo đã mở khoá.' })
  @ZodResponse({ status: 200, description: 'Người dùng đã được mở khoá', type: ConsoleUserDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy người dùng', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'USER_STATUS_CONFLICT', type: ErrorResponseDto })
  unlock(@Param() params: UuidParamsDto): Promise<ConsoleUserDto> {
    return this.users.unlock(params.id);
  }
}

/** Catalogue (spec §11): add, rename, turn on or off. Nothing is deleted. */
@ApiTags('Console: danh mục')
@ApiForbiddenResponse(NOT_ADMIN)
@Roles('ADMIN')
@Controller('console')
export class ConsoleCatalogController {
  constructor(@Inject(ConsoleCatalogService) private readonly catalog: ConsoleCatalogService) {}

  @Get('car-makes')
  @ApiOperation({
    summary: 'Hãng xe và dòng xe',
    description: 'Kể cả mục đã tắt, kèm số xe đang dùng.',
  })
  @ZodResponse({ status: 200, description: 'Hãng xe', type: CarMakeListDto })
  listMakes(): Promise<CarMakeListDto> {
    return this.catalog.listMakes();
  }

  @Post('car-makes')
  @ApiOperation({ summary: 'Thêm hãng xe' })
  @ZodResponse({ status: 201, description: 'Hãng xe mới', type: CarMakeDto })
  @ApiConflictResponse({ description: 'CATALOG_DUPLICATE', type: ErrorResponseDto })
  createMake(@Body() body: CreateCatalogItemDto): Promise<CarMakeDto> {
    return this.catalog.createMake(body);
  }

  @Patch('car-makes/:id')
  @ApiOperation({
    summary: 'Sửa hãng xe',
    description:
      'Đổi tên hoặc bật/tắt. Tắt hãng thì các dòng xe của hãng cũng không chọn được khi đăng xe.',
  })
  @ZodResponse({ status: 200, description: 'Hãng xe', type: CarMakeDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hãng xe', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'CATALOG_DUPLICATE', type: ErrorResponseDto })
  updateMake(
    @Param() params: IntParamsDto,
    @Body() body: UpdateCatalogItemDto,
  ): Promise<CarMakeDto> {
    return this.catalog.updateMake(params.id, body);
  }

  @Post('car-makes/:id/models')
  @ApiOperation({ summary: 'Thêm dòng xe' })
  @ZodResponse({ status: 201, description: 'Dòng xe mới', type: CarModelDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hãng xe', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'CATALOG_DUPLICATE', type: ErrorResponseDto })
  createModel(
    @Param() params: IntParamsDto,
    @Body() body: CreateCatalogItemDto,
  ): Promise<CarModelDto> {
    return this.catalog.createModel(params.id, body);
  }

  @Patch('car-models/:id')
  @ApiOperation({ summary: 'Sửa dòng xe', description: 'Đổi tên hoặc bật/tắt.' })
  @ZodResponse({ status: 200, description: 'Dòng xe', type: CarModelDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy dòng xe', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'CATALOG_DUPLICATE', type: ErrorResponseDto })
  updateModel(
    @Param() params: IntParamsDto,
    @Body() body: UpdateCatalogItemDto,
  ): Promise<CarModelDto> {
    return this.catalog.updateModel(params.id, body);
  }

  @Get('amenities')
  @ApiOperation({ summary: 'Tiện nghi', description: 'Kể cả mục đã tắt, kèm số xe đang dùng.' })
  @ZodResponse({ status: 200, description: 'Tiện nghi', type: AmenityListDto })
  listAmenities(): Promise<AmenityListDto> {
    return this.catalog.listAmenities();
  }

  @Post('amenities')
  @ApiOperation({
    summary: 'Thêm tiện nghi',
    description: '`code` cố định, không đổi được sau này.',
  })
  @ZodResponse({ status: 201, description: 'Tiện nghi mới', type: AmenityDto })
  @ApiConflictResponse({ description: 'CATALOG_DUPLICATE', type: ErrorResponseDto })
  createAmenity(@Body() body: CreateAmenityDto): Promise<AmenityDto> {
    return this.catalog.createAmenity(body);
  }

  @Patch('amenities/:id')
  @ApiOperation({ summary: 'Sửa tiện nghi', description: 'Đổi tên, thứ tự hiển thị hoặc bật/tắt.' })
  @ZodResponse({ status: 200, description: 'Tiện nghi', type: AmenityDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tiện nghi', type: ErrorResponseDto })
  updateAmenity(
    @Param() params: IntParamsDto,
    @Body() body: UpdateAmenityDto,
  ): Promise<AmenityDto> {
    return this.catalog.updateAmenity(params.id, body);
  }
}
