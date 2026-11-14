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
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { z } from 'zod';

import {
  carQuoteInputSchema,
  carSearchPageSchema,
  carSearchQuerySchema,
  paginationQuerySchema,
  priceQuoteSchema,
  publicCarReviewPageSchema,
  publicCarSchema,
} from '@carenta/shared';

import { Public } from '../auth/decorators.js';
import { ErrorResponseDto } from '../docs/api-docs.js';
import { CarSearchService } from './car-search.service.js';
import { PublicCarsService } from './public-cars.service.js';

class CarSearchQueryDto extends createZodDto(carSearchQuerySchema) {}
class CarSearchPageDto extends createZodDto(carSearchPageSchema) {}
class CarParamsDto extends createZodDto(z.object({ id: z.uuid() })) {}
class PublicCarDto extends createZodDto(publicCarSchema) {}
class ReviewsQueryDto extends createZodDto(paginationQuerySchema) {}
class PublicCarReviewPageDto extends createZodDto(publicCarReviewPageSchema) {}
class CarQuoteInputDto extends createZodDto(carQuoteInputSchema) {}
class PriceQuoteDto extends createZodDto(priceQuoteSchema) {}

/** Public search, detail, published car reviews and price previews (spec §5.1–5.2). */
@ApiTags('Tìm xe')
@Public()
@Controller('cars')
export class PublicCarsController {
  constructor(
    @Inject(CarSearchService) private readonly search: CarSearchService,
    @Inject(PublicCarsService) private readonly cars: PublicCarsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Tìm xe',
    description: [
      'Chỉ trả xe đang hiển thị. Không có biển số, không có địa chỉ chính xác.',
      '',
      '**Địa điểm**: `province`, `ward` (khớp một phần, không phân biệt hoa thường) và/hoặc `lat` + `lng` + `radiusKm` (mặc định 10, tối đa 50).',
      '**Thời gian**: `startAt` + `endAt` (tuỳ chọn, bước 30 phút, nhận xe cách hiện tại ≥ 2 giờ và ≤ 90 ngày). Có thời gian thì chỉ trả xe trống cả chuyến (tính cả thời gian đệm) và có thời gian thuê tối thiểu/tối đa phù hợp, kèm `estimate` là tiền thuê ước tính.',
      '**Giá**: `minPrice`, `maxPrice` so với `prices.dailyEquivalentPrice` (giá ngày; không có giá ngày thì mức thấp hơn của giá giờ × 24 và giá tháng ÷ 30).',
      '**Danh sách** (`makeIds`, `bodyTypes`, `transmissions`, `fuelTypes`, `amenityIds`): lặp tham số hoặc cách nhau bằng dấu phẩy. Xe khớp một giá trị bất kỳ, riêng `amenityIds` phải có đủ mọi tiện nghi.',
      '',
      '**Vị trí gần đúng**: mỗi xe lệch cố định 200 m – 1 km; vẽ vòng tròn `location.radiusMeters` quanh điểm này. Lọc bán kính và `distanceKm` cũng tính theo điểm gần đúng.',
      '**Sắp xếp** `sort`: `price_asc`, `price_desc`, `rating`, `distance` (cần `lat`/`lng`), `newest`. Mặc định: có toạ độ thì `distance`, không thì `newest`.',
    ].join('\n'),
  })
  @ZodResponse({ status: 200, description: 'Một trang kết quả', type: CarSearchPageDto })
  list(@Query() query: CarSearchQueryDto): Promise<CarSearchPageDto> {
    return this.search.search(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết xe công khai',
    description:
      'Chỉ xe đang hiển thị. Biển số được che, vị trí gần đúng giống tìm kiếm. Không trả giấy tờ, địa chỉ chính xác hoặc bản sửa chờ duyệt, kể cả khi chủ xe gọi. Kèm hồ sơ chủ xe công khai, điểm đánh giá, số chuyến hoàn tất và trang đầu đánh giá đã công bố. Lịch trống lấy riêng tại GET /cars/:id/availability.',
  })
  @ZodResponse({ status: 200, description: 'Thông tin xe công khai', type: PublicCarDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy xe đang hiển thị.', type: ErrorResponseDto })
  get(@Param() params: CarParamsDto): Promise<PublicCarDto> {
    return this.cars.get(params.id);
  }

  @Get(':id/reviews')
  @ApiOperation({
    summary: 'Đánh giá đã công bố của xe',
    description:
      'Chỉ đánh giá từ người thuê cho xe này, mới công bố trước. page mặc định 1, pageSize mặc định 20, tối đa 100. Không có mã đơn hoặc thông tin liên hệ.',
  })
  @ZodResponse({ status: 200, description: 'Một trang đánh giá', type: PublicCarReviewPageDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy xe đang hiển thị.', type: ErrorResponseDto })
  reviews(
    @Param() params: CarParamsDto,
    @Query() query: ReviewsQueryDto,
  ): Promise<PublicCarReviewPageDto> {
    return this.cars.reviews(params.id, query);
  }

  @Post(':id/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Báo giá chuyến',
    description: [
      'Không cần đăng nhập hoặc GPLX. startAt/endAt là ISO 8601 có múi giờ, bước 30 phút; nhận xe cách hiện tại từ 2 giờ đến 90 ngày.',
      'pickupMethod: SELF_PICKUP (nhận tại chỗ) hoặc DELIVERY (giao xe, cần deliveryLocation.latitude/longitude).',
      'API tự tính khoảng cách từ điểm gần đúng cố định giống bản đồ, áp dụng bán kính giao, rồi tính lại mọi dòng giá bằng quoteRental với ngày lễ hiện tại. Không dùng số tiền hoặc khoảng cách do client gửi.',
      'Kiểm tra lịch bằng quy tắc chung với tìm kiếm, tính cả đệm của đơn hiện có và chuyến mới. Lịch bận trả 409 CAR_UNAVAILABLE, không có báo giá.',
      'Báo giá chỉ có giá trị tham khảo, không giữ chỗ hoặc chốt giá. Khi tạo đơn hệ thống kiểm tra và tính lại; phí giao xe cũng dùng cùng điểm gần đúng.',
    ].join('\n'),
  })
  @ZodResponse({
    status: 200,
    description: 'Chi tiết tiền thuê, phụ phí, giảm giá, phí giao xe, tiền cọc và tổng tiền',
    type: PriceQuoteDto,
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy xe đang hiển thị.', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'CAR_UNAVAILABLE', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({
    description:
      'RENTAL_TOO_SHORT; RENTAL_TOO_LONG; RENTAL_PRICE_UNAVAILABLE; DELIVERY_UNAVAILABLE; DELIVERY_TOO_FAR',
    type: ErrorResponseDto,
  })
  quote(@Param() params: CarParamsDto, @Body() body: CarQuoteInputDto): Promise<PriceQuoteDto> {
    return this.cars.quote(params.id, body);
  }
}
