import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
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
  bookingListQuerySchema,
  bookingPageSchema,
  bookingSchema,
  createBookingSchema,
  rejectBookingSchema,
} from '@carenta/shared';

import { ACCESS_COOKIE } from '../auth/auth.constants.js';
import { CurrentAuth, type RequestAuth, RequireVerifiedEmail } from '../auth/decorators.js';
import { ErrorResponseDto } from '../docs/api-docs.js';
import { BookingsService } from './bookings.service.js';

class CreateBookingDto extends createZodDto(createBookingSchema) {}
class RejectBookingDto extends createZodDto(rejectBookingSchema) {}
class BookingDto extends createZodDto(bookingSchema) {}
class BookingPageDto extends createZodDto(bookingPageSchema) {}
class BookingQueryDto extends createZodDto(bookingListQuerySchema) {}
class BookingParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}

@ApiTags('Chuyến của tôi')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiNotFoundResponse({
  description: 'Không tìm thấy đơn thuê hoặc bạn không phải người tham gia.',
  type: ErrorResponseDto,
})
@Controller('bookings')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Post()
  @RequireVerifiedEmail()
  @ApiOperation({
    summary: 'Đặt xe',
    description: [
      'Cần email đã xác thực và GPLX đủ điều kiện. Thời gian như báo giá; thêm carId, requestId (UUID mới cho mỗi lần đặt) và termsAccepted: true.',
      'Giao xe cần deliveryLocation và deliveryAddress. API tự tính lại giá, kiểm tra lịch và chốt bảng giá, chi phí, đệm trong cùng transaction.',
      'Đặt nhanh → AWAITING_PAYMENT, giữ lịch tối đa 30 phút. Duyệt tay → PENDING_APPROVAL, không giữ lịch; hạn duyệt tối đa 6 giờ và chậm nhất 30 phút trước giờ nhận.',
      'Gửi lại cùng requestId và nội dung sẽ trả đơn cũ, không tạo thêm hoặc gia hạn; cùng mã nhưng nội dung khác trả BOOKING_REQUEST_CONFLICT. Không dùng tiền, trạng thái hoặc thời gian đồng ý do client gửi.',
    ].join('\n'),
  })
  @ZodResponse({
    status: 201,
    description: 'Đơn thuê đã tạo hoặc kết quả gửi lại',
    type: BookingDto,
  })
  @ApiForbiddenResponse({
    description: 'EMAIL_NOT_VERIFIED; ACCOUNT_LOCKED',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'CAR_UNAVAILABLE; BOOKING_REQUEST_CONFLICT',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'BOOKING_SELF_RENTAL; BOOKING_ELIGIBILITY_FAILED; RENTAL_TOO_SHORT; RENTAL_TOO_LONG; DELIVERY_UNAVAILABLE; DELIVERY_TOO_FAR',
    type: ErrorResponseDto,
  })
  create(@CurrentAuth() auth: RequestAuth, @Body() body: CreateBookingDto): Promise<BookingDto> {
    return this.bookings.create(auth.user.id, body);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách chuyến của tôi',
    description:
      'Các đơn mình thuê, mới tạo trước. Lọc status, phân trang chung. Tự cập nhật đơn đã quá hạn trước khi đọc.',
  })
  @ZodResponse({ status: 200, description: 'Một trang chuyến', type: BookingPageDto })
  list(@CurrentAuth() auth: RequestAuth, @Query() query: BookingQueryDto): Promise<BookingPageDto> {
    return this.bookings.list(auth.user.id, 'RENTER', query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết đơn thuê',
    description:
      'Chỉ người thuê hoặc chủ xe. Trước xác nhận: che biển số, vị trí xe gần đúng, ẩn số điện thoại hai bên. Chủ xe chưa thấy địa chỉ giao chính xác; người thuê vẫn thấy địa chỉ mình nhập. Sau xác nhận mới có địa chỉ nhận xe và số liên hệ. Không trả GPLX hoặc giấy tờ xe.',
  })
  @ZodResponse({ status: 200, description: 'Đơn thuê và lịch sử trạng thái', type: BookingDto })
  get(@CurrentAuth() auth: RequestAuth, @Param() params: BookingParamsDto): Promise<BookingDto> {
    return this.bookings.get(auth.user.id, params.id);
  }

  @Post(':id/checkout')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bắt đầu thanh toán',
    description:
      'Chỉ người thuê, đơn AWAITING_PAYMENT. Lần đầu rút hạn còn tối đa 15 phút, không vượt hạn thanh toán cũ hoặc giờ nhận. Gọi lại không gia hạn. Endpoint chỉ khởi tạo hạn giữ chỗ; URL VNPay được bổ sung ở phần thanh toán.',
  })
  @ZodResponse({
    status: 200,
    description: 'Đơn thuê với hạn thanh toán có hiệu lực',
    type: BookingDto,
  })
  @ApiForbiddenResponse({ description: 'EMAIL_NOT_VERIFIED', type: ErrorResponseDto })
  @ApiConflictResponse({
    description: 'BOOKING_EXPIRED; BOOKING_STATUS_CONFLICT',
    type: ErrorResponseDto,
  })
  checkout(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: BookingParamsDto,
  ): Promise<BookingDto> {
    return this.bookings.beginCheckout(auth.user.id, params.id);
  }
}

@ApiTags('Đơn cho thuê')
@ApiCookieAuth(ACCESS_COOKIE)
@ApiNotFoundResponse({ description: 'Không tìm thấy đơn thuê của bạn.', type: ErrorResponseDto })
@Controller('owner/bookings')
export class OwnerBookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách đơn cho thuê',
    description: 'Các đơn thuê xe của mình, mới tạo trước. Lọc status và phân trang chung.',
  })
  @ZodResponse({ status: 200, description: 'Một trang đơn cho thuê', type: BookingPageDto })
  list(@CurrentAuth() auth: RequestAuth, @Query() query: BookingQueryDto): Promise<BookingPageDto> {
    return this.bookings.list(auth.user.id, 'OWNER', query);
  }

  @Post(':id/accept')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chấp nhận yêu cầu đặt xe',
    description:
      'Chỉ đơn duyệt tay còn hạn. Kiểm tra lại lịch với đệm đã chốt, xe đang hiển thị, tài khoản và GPLX; lỗi thì giữ chờ duyệt. Giữ nguyên giá lúc đặt. Thành công chuyển AWAITING_PAYMENT và giữ lịch tối đa 30 phút, không quá giờ nhận. Gửi lại khi đã chấp nhận không gia hạn.',
  })
  @ZodResponse({ status: 200, description: 'Đơn đã chấp nhận', type: BookingDto })
  @ApiConflictResponse({
    description: 'CAR_UNAVAILABLE; BOOKING_EXPIRED; BOOKING_STATUS_CONFLICT',
    type: ErrorResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description: 'BOOKING_ELIGIBILITY_FAILED',
    type: ErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'EMAIL_NOT_VERIFIED; ACCOUNT_LOCKED',
    type: ErrorResponseDto,
  })
  accept(@CurrentAuth() auth: RequestAuth, @Param() params: BookingParamsDto): Promise<BookingDto> {
    return this.bookings.accept(auth.user.id, params.id);
  }

  @Post(':id/reject')
  @RequireVerifiedEmail()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Từ chối yêu cầu đặt xe',
    description:
      'Chỉ đơn duyệt tay còn hạn. Có thể gửi reason. Ghi lịch sử với vai trò OWNER; gọi lại không ghi trùng. Không phải thao tác huỷ đơn đã chấp nhận/xác nhận.',
  })
  @ZodResponse({ status: 200, description: 'Đơn đã từ chối', type: BookingDto })
  @ApiConflictResponse({
    description: 'BOOKING_EXPIRED; BOOKING_STATUS_CONFLICT',
    type: ErrorResponseDto,
  })
  @ApiForbiddenResponse({ description: 'EMAIL_NOT_VERIFIED', type: ErrorResponseDto })
  reject(
    @CurrentAuth() auth: RequestAuth,
    @Param() params: BookingParamsDto,
    @Body() body: RejectBookingDto,
  ): Promise<BookingDto> {
    return this.bookings.reject(auth.user.id, params.id, body.reason);
  }
}
