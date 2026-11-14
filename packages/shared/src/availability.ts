import { z } from 'zod';

import { TIME_STEP_MINUTES } from './constants.js';

const instant = z.iso.datetime({ offset: true, error: 'Thời gian không hợp lệ.' });

export const availabilityMonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
    error: 'Tháng phải theo định dạng YYYY-MM.',
  }),
});

/** Owner blocks have no booking lead-time or rental-duration limits. */
export const availabilityBlockInputSchema = z
  .object({
    startAt: instant,
    endAt: instant,
    reason: z.string().trim().max(500, { error: 'Lý do tối đa 500 ký tự.' }).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    const start = new Date(input.startAt).getTime();
    const end = new Date(input.endAt).getTime();
    const step = TIME_STEP_MINUTES * 60_000;
    for (const [path, value] of [
      ['startAt', start],
      ['endAt', end],
    ] as const) {
      if (Number.isFinite(value) && value % step !== 0) {
        ctx.addIssue({
          code: 'custom',
          path: [path],
          message: `Thời gian phải theo bước ${TIME_STEP_MINUTES} phút.`,
        });
      }
    }
    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) {
      ctx.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'Giờ kết thúc phải sau giờ bắt đầu.',
      });
    }
  });

export const availabilityBlockSchema = z.object({
  id: z.uuid(),
  startAt: instant,
  endAt: instant,
  reason: z.string().nullable(),
});

/** Anonymous calendar data deliberately contains no ids, reasons or booking metadata. */
export const carAvailabilitySchema = z.object({
  month: availabilityMonthQuerySchema.shape.month,
  busy: z.array(z.object({ startAt: instant, endAt: instant })),
});

export type AvailabilityBlockInput = z.infer<typeof availabilityBlockInputSchema>;
export type AvailabilityBlock = z.infer<typeof availabilityBlockSchema>;
export type CarAvailability = z.infer<typeof carAvailabilitySchema>;
