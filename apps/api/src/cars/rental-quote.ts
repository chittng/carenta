import { HttpStatus } from '@nestjs/common';

import {
  type CarQuoteInput,
  distanceKm,
  ErrorCode,
  type PriceQuote,
  type QuoteErrorCode,
  quoteRental,
  vietnamDate,
} from '@carenta/shared';

import { fromDateOnly, toDateOnly } from '../common/dates.js';
import { AppException } from '../common/errors/app.exception.js';
import { type Prisma } from '../generated/prisma/client.js';
import { toDeliveryView } from './cars.mapper.js';

export const QUOTE_CAR_SELECT = {
  id: true,
  pricing: true,
  depositAmount: true,
  bufferMinutes: true,
  approxLatitude: true,
  approxLongitude: true,
  deliveryEnabled: true,
  deliveryMaxRadiusKm: true,
  deliveryFreeRadiusKm: true,
  deliveryFeePerKm: true,
} as const satisfies Prisma.CarSelect;
type QuoteCar = Prisma.CarGetPayload<{ select: typeof QUOTE_CAR_SELECT }>;

const QUOTE_ERROR: Record<QuoteErrorCode, ErrorCode> = {
  INVALID_RANGE: ErrorCode.VALIDATION_FAILED,
  OFF_STEP: ErrorCode.VALIDATION_FAILED,
  TOO_SHORT: ErrorCode.RENTAL_TOO_SHORT,
  TOO_LONG: ErrorCode.RENTAL_TOO_LONG,
  NO_PRICE: ErrorCode.RENTAL_PRICE_UNAVAILABLE,
  DELIVERY_UNAVAILABLE: ErrorCode.DELIVERY_UNAVAILABLE,
  DELIVERY_TOO_FAR: ErrorCode.DELIVERY_TOO_FAR,
};

/** Preview and booking use identical server pricing and the PUBLIC delivery origin. */
export async function rentalQuote(
  tx: Prisma.TransactionClient,
  car: QuoteCar,
  input: CarQuoteInput,
): Promise<{
  quote: PriceQuote;
  deliveryDistanceKm: number | null;
  holidays: string[];
}> {
  if (!car.pricing)
    throw new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.RENTAL_PRICE_UNAVAILABLE,
      'Xe chưa có bảng giá.',
    );
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);
  const rows = await tx.holiday.findMany({
    where: {
      date: {
        gte: fromDateOnly(vietnamDate(startAt)),
        lte: fromDateOnly(vietnamDate(endAt)),
      },
    },
    select: { date: true },
  });
  const holidays = rows.map((holiday) => toDateOnly(holiday.date));
  if (input.pickupMethod === 'DELIVERY' && !input.deliveryLocation) {
    const message = 'Vui lòng chọn vị trí giao xe.';
    throw new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED, message, [
      { path: 'deliveryLocation', message },
    ]);
  }
  const deliveryDistanceKm =
    input.pickupMethod === 'DELIVERY' && input.deliveryLocation
      ? distanceKm(
          { latitude: car.approxLatitude.toNumber(), longitude: car.approxLongitude.toNumber() },
          input.deliveryLocation,
        )
      : null;
  const result = quoteRental({
    pricing: car.pricing,
    depositAmount: car.depositAmount,
    delivery: toDeliveryView(car),
    startAt,
    endAt,
    holidays,
    deliveryDistanceKm,
  });
  if (!result.ok)
    throw new AppException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      QUOTE_ERROR[result.code],
      result.message,
    );
  return { quote: result.quote, deliveryDistanceKm, holidays };
}
