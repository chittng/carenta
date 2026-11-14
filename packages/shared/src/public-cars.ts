import { z } from 'zod';

import { carLocationSchema, normalizeLicensePlate, ownerCarSchema } from './cars.js';
import { pageOf } from './pagination.js';
import { carPricingViewSchema, tripWindowIssue } from './rental-terms.js';
import { carSearchResultSchema } from './search.js';
import { publicProfileSchema } from './users.js';

/** Public plates retain only their area/series and last two digits, including old plates. */
export function maskLicensePlate(input: string): string {
  const plate = normalizeLicensePlate(input);
  if (plate === null) return '***';
  const separator = plate.indexOf('-');
  return plate.slice(0, separator + 1) + plate.slice(separator + 1).replace(/\d(?=.{2})/g, '*');
}

export const publicCarReviewSchema = z.object({
  id: z.uuid(),
  rating: z.int().min(1).max(5),
  comment: z.string().nullable(),
  publishedAt: z.iso.datetime({ offset: true }),
  author: publicProfileSchema.pick({ id: true, fullName: true, avatarUrl: true }),
});
export const publicCarReviewPageSchema = pageOf(publicCarReviewSchema);

/** Explicit public fields only; owner/admin metadata and pending revisions stay private. */
export const publicCarSchema = ownerCarSchema
  .pick({
    id: true,
    make: true,
    model: true,
    year: true,
    licensePlate: true,
    color: true,
    bodyType: true,
    seats: true,
    transmission: true,
    fuelType: true,
    fuelConsumption: true,
    odometerKm: true,
    description: true,
    rules: true,
    mileageLimit: true,
    amenities: true,
    instantBook: true,
    depositAmount: true,
    bufferMinutes: true,
    delivery: true,
    photos: true,
  })
  .extend({
    location: carSearchResultSchema.shape.location,
    pricing: carPricingViewSchema.extend({ dailyEquivalentPrice: z.int() }),
    owner: publicProfileSchema,
    rating: carSearchResultSchema.shape.rating,
    tripCount: z.int(),
    /** First page; further pages come from GET /cars/:id/reviews. */
    reviews: publicCarReviewPageSchema,
  });

export const PickupMethod = { SELF_PICKUP: 'SELF_PICKUP', DELIVERY: 'DELIVERY' } as const;
export type PickupMethod = (typeof PickupMethod)[keyof typeof PickupMethod];

const tripFields = {
  startAt: z.iso.datetime({ offset: true, error: 'Giờ nhận xe không hợp lệ.' }),
  endAt: z.iso.datetime({ offset: true, error: 'Giờ trả xe không hợp lệ.' }),
};

/** No client-supplied prices or distances are used; coordinates are enough for a quote. */
export const carQuoteInputSchema = z
  .object({
    ...tripFields,
    pickupMethod: z.enum(PickupMethod),
    deliveryLocation: carLocationSchema.pick({ latitude: true, longitude: true }).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.pickupMethod === PickupMethod.DELIVERY && !input.deliveryLocation) {
      ctx.addIssue({
        code: 'custom',
        path: ['deliveryLocation'],
        message: 'Vui lòng chọn vị trí giao xe.',
      });
    }
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (Number.isFinite(startAt.getTime()) && Number.isFinite(endAt.getTime())) {
      const issue = tripWindowIssue(startAt, endAt);
      if (issue) ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
  });

export type PublicCar = z.infer<typeof publicCarSchema>;
export type PublicCarReviewPage = z.infer<typeof publicCarReviewPageSchema>;
export type CarQuoteInput = z.infer<typeof carQuoteInputSchema>;
