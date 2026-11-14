import { z } from 'zod';

import {
  APPROX_LOCATION_RADIUS_M,
  type Booking,
  carDeliveryViewSchema,
  carPricingViewSchema,
  carRulesSchema,
  catalogRefSchema,
  maskLicensePlate,
  priceQuoteSchema,
} from '@carenta/shared';

import { type Prisma } from '../generated/prisma/client.js';
import { type UploadsService } from '../storage/uploads.service.js';

/** This snapshot contains private pickup data. Never serialize it directly to a response. */
export const bookingSnapshotSchema = z.object({
  version: z.literal(1),
  instantBook: z.boolean(),
  bufferMinutes: z.int(),
  pricing: carPricingViewSchema,
  depositAmount: z.int(),
  delivery: carDeliveryViewSchema.nullable(),
  mileageLimit: z.object({ dailyKm: z.int(), extraFeePerKm: z.int() }).nullable(),
  rules: carRulesSchema,
  holidays: z.array(z.string()),
  car: z.object({
    make: catalogRefSchema,
    model: catalogRefSchema,
    year: z.int(),
    licensePlate: z.string(),
    coverPhotoKey: z.string().nullable(),
    province: z.string(),
    ward: z.string(),
    addressLine: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    approxLatitude: z.number(),
    approxLongitude: z.number(),
  }),
});
export type BookingSnapshot = z.infer<typeof bookingSnapshotSchema>;

const participant = { select: { id: true, fullName: true, phone: true, avatarKey: true } } as const;
export const BOOKING_VIEW_INCLUDE = {
  renter: participant,
  owner: participant,
  statusLogs: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} as const satisfies Prisma.BookingInclude;
export type BookingRecord = Prisma.BookingGetPayload<{ include: typeof BOOKING_VIEW_INCLUDE }>;

export function toBooking(uploads: UploadsService, row: BookingRecord, viewerId: string): Booking {
  const snapshot = bookingSnapshotSchema.parse(row.pricingSnapshot);
  const pickup = snapshot.car;
  // Confirmation is historical: cancelling a previously confirmed trip does not hide
  // details the participants already received. An unpaid cancellation never reveals them.
  const disclosed = row.confirmedAt !== null;
  const ownDelivery = row.renterId === viewerId || disclosed;
  const party = (user: BookingRecord['renter']) => ({
    id: user.id,
    fullName: user.fullName,
    phone: disclosed ? user.phone : null,
    avatarUrl: user.avatarKey ? uploads.avatarUrl(user.avatarKey) : null,
  });
  return {
    id: row.id,
    requestId: row.requestId,
    status: row.status,
    viewerRole: row.renterId === viewerId ? 'RENTER' : 'OWNER',
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    blockedUntil: row.blockedUntil.toISOString(),
    createdAt: row.createdAt.toISOString(),
    approvalDeadlineAt: row.approvalDeadlineAt?.toISOString() ?? null,
    paymentDeadlineAt: row.paymentDeadlineAt?.toISOString() ?? null,
    checkoutStartedAt: row.checkoutStartedAt?.toISOString() ?? null,
    termsAcceptedAt: row.termsAcceptedAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
    car: {
      id: row.carId,
      make: pickup.make,
      model: pickup.model,
      year: pickup.year,
      licensePlate: disclosed ? pickup.licensePlate : maskLicensePlate(pickup.licensePlate),
      coverPhoto: pickup.coverPhotoKey ? uploads.carPhotoUrls(pickup.coverPhotoKey) : null,
      location: {
        province: pickup.province,
        ward: pickup.ward,
        addressLine: disclosed ? pickup.addressLine : null,
        latitude: disclosed ? pickup.latitude : pickup.approxLatitude,
        longitude: disclosed ? pickup.longitude : pickup.approxLongitude,
        radiusMeters: disclosed ? null : APPROX_LOCATION_RADIUS_M,
      },
    },
    renter: party(row.renter),
    owner: party(row.owner),
    pickupMethod: row.pickupMethod,
    delivery:
      row.pickupMethod === 'DELIVERY'
        ? {
            address: ownDelivery ? row.deliveryAddress : null,
            location:
              ownDelivery && row.deliveryLatitude !== null && row.deliveryLongitude !== null
                ? {
                    latitude: row.deliveryLatitude.toNumber(),
                    longitude: row.deliveryLongitude.toNumber(),
                  }
                : null,
            distanceKm: row.deliveryDistanceKm?.toNumber() ?? 0,
          }
        : null,
    instantBook: snapshot.instantBook,
    bufferMinutes: snapshot.bufferMinutes,
    pricing: snapshot.pricing,
    priceBreakdown: priceQuoteSchema.parse(row.priceBreakdown),
    history: row.statusLogs.map((log) => ({
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      actorRole: log.actorRole,
      note: log.note,
      createdAt: log.createdAt.toISOString(),
    })),
  };
}
