import { z } from 'zod';

import { carLocationSchema, carPhotoUrlsSchema, catalogRefSchema } from './cars.js';
import { paginationQuerySchema, pageOf } from './pagination.js';
import { priceQuoteSchema } from './pricing.js';
import { carQuoteInputSchema, PickupMethod } from './public-cars.js';
import { carPricingViewSchema } from './rental-terms.js';

export const BookingStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  RETURNED: 'RETURNED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  DISPUTED: 'DISPUTED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const ActorRole = {
  RENTER: 'RENTER',
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  SYSTEM: 'SYSTEM',
} as const;
export type ActorRole = (typeof ActorRole)[keyof typeof ActorRole];

export const APPROVAL_WINDOW_HOURS = 6;
export const PAYMENT_WINDOW_MINUTES = 30;
export const CHECKOUT_HOLD_MINUTES = 15;

/** Approval leaves a full payment window before pickup (decided 2026-11-14). */
export const approvalDeadline = (createdAt: Date, startAt: Date): Date =>
  new Date(
    Math.min(
      createdAt.getTime() + APPROVAL_WINDOW_HOURS * 3_600_000,
      startAt.getTime() - PAYMENT_WINDOW_MINUTES * 60_000,
    ),
  );
export const paymentDeadline = (acceptedAt: Date, startAt: Date): Date =>
  new Date(Math.min(acceptedAt.getTime() + PAYMENT_WINDOW_MINUTES * 60_000, startAt.getTime()));
export const checkoutDeadline = (startedAt: Date, existingDeadline: Date): Date =>
  new Date(
    Math.min(startedAt.getTime() + CHECKOUT_HOLD_MINUTES * 60_000, existingDeadline.getTime()),
  );

/** Time-relative checks happen after idempotency lookup, so a retry can replay an old order. */
export const createBookingSchema = z
  .object({
    ...carQuoteInputSchema.shape,
    carId: z.uuid(),
    requestId: z.uuid({ error: 'Mã yêu cầu đặt xe không hợp lệ.' }),
    termsAccepted: z.literal(true, { error: 'Vui lòng đồng ý điều khoản và hợp đồng thuê.' }),
    deliveryAddress: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.pickupMethod === PickupMethod.DELIVERY) {
      if (!input.deliveryLocation)
        ctx.addIssue({
          code: 'custom',
          path: ['deliveryLocation'],
          message: 'Vui lòng chọn vị trí giao xe.',
        });
      if (!input.deliveryAddress)
        ctx.addIssue({
          code: 'custom',
          path: ['deliveryAddress'],
          message: 'Vui lòng nhập địa chỉ giao xe.',
        });
    }
  });

export const rejectBookingSchema = z.object({
  reason: z.string().trim().max(1000, { error: 'Lý do tối đa 1.000 ký tự.' }).optional(),
});

export const bookingListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(BookingStatus).optional(),
});

const instant = z.iso.datetime({ offset: true });
const participant = z.object({
  id: z.uuid(),
  fullName: z.string(),
  avatarUrl: z.url().nullable(),
  phone: z.string().nullable(),
});
export const bookingSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid().nullable(),
  status: z.enum(BookingStatus),
  viewerRole: z.enum(['RENTER', 'OWNER']),
  startAt: instant,
  endAt: instant,
  blockedUntil: instant,
  createdAt: instant,
  approvalDeadlineAt: instant.nullable(),
  paymentDeadlineAt: instant.nullable(),
  checkoutStartedAt: instant.nullable(),
  termsAcceptedAt: instant,
  confirmedAt: instant.nullable(),
  cancelledAt: instant.nullable(),
  cancellationReason: z.string().nullable(),
  car: z.object({
    id: z.uuid(),
    make: catalogRefSchema,
    model: catalogRefSchema,
    year: z.int(),
    licensePlate: z.string(),
    coverPhoto: carPhotoUrlsSchema.nullable(),
    location: z.object({
      province: z.string(),
      ward: z.string(),
      addressLine: z.string().nullable(),
      latitude: z.number(),
      longitude: z.number(),
      radiusMeters: z.int().nullable(),
    }),
  }),
  renter: participant,
  owner: participant,
  pickupMethod: z.enum(PickupMethod),
  delivery: z
    .object({
      address: z.string().nullable(),
      location: carLocationSchema.pick({ latitude: true, longitude: true }).nullable(),
      distanceKm: z.int(),
    })
    .nullable(),
  instantBook: z.boolean(),
  bufferMinutes: z.int(),
  pricing: carPricingViewSchema,
  priceBreakdown: priceQuoteSchema,
  history: z.array(
    z.object({
      fromStatus: z.enum(BookingStatus).nullable(),
      toStatus: z.enum(BookingStatus),
      actorRole: z.enum(ActorRole),
      note: z.string().nullable(),
      createdAt: instant,
    }),
  ),
});
export const bookingSummarySchema = bookingSchema.omit({ history: true });
export const bookingPageSchema = pageOf(bookingSummarySchema);

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type Booking = z.infer<typeof bookingSchema>;
export type BookingSummary = z.infer<typeof bookingSummarySchema>;
export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
export type BookingPage = z.infer<typeof bookingPageSchema>;
