import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { carSearchPageSchema, carSearchQuerySchema } from '@carenta/shared';

import { Public } from '../auth/decorators.js';
import { CarSearchService } from './car-search.service.js';

class CarSearchQueryDto extends createZodDto(carSearchQuerySchema) {}
class CarSearchPageDto extends createZodDto(carSearchPageSchema) {}

/** Public car pages and search (spec §5.1–5.2). The car page itself comes with CARENTA-24. */
@ApiTags('Tìm xe')
@Public()
@Controller('cars')
export class PublicCarsController {
  constructor(@Inject(CarSearchService) private readonly search: CarSearchService) {}

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
}
