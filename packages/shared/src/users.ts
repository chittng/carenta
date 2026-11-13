import { z } from 'zod';

import { fullNameSchema } from './auth.js';

// ─── Phone ──────────────────────────────────────────────────────────────────

/**
 * Normalises a Vietnamese mobile number to `0xxxxxxxxx` (decided 2026-11-14: optional, not
 * verified, not unique). Accepts `+84`/`84`/`0` prefixes with spaces, dots or dashes;
 * returns null for anything else, landlines included.
 */
export function normalizeVietnamesePhone(input: string): string | null {
  const compact = input.replace(/[\s.()-]/g, '');
  const match = /^(?:\+?84|0)([35789]\d{8})$/.exec(compact);
  return match ? `0${match[1]}` : null;
}

export const phoneSchema = z
  .string()
  .max(20, { error: 'Số điện thoại không hợp lệ. Ví dụ: 0912 345 678' })
  .transform((value, ctx) => {
    if (value.trim() === '') return null;
    const phone = normalizeVietnamesePhone(value);
    if (phone === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Số điện thoại không hợp lệ. Ví dụ: 0912 345 678',
      });
      return z.NEVER;
    }
    return phone;
  });

// ─── Response rate ──────────────────────────────────────────────────────────

/** Booking requests from the last 90 days count towards the response rate. */
export const RESPONSE_RATE_WINDOW_DAYS = 90;

/**
 * Share of booking requests (manual approval) the owner accepted or declined before the
 * 6-hour deadline (decided 2026-11-14), as a whole percent. Requests still pending or
 * cancelled by the renter first do not count. Null when there is nothing to measure.
 */
export function responseRatePercent(answered: number, expired: number): number | null {
  const total = answered + expired;
  return total === 0 ? null : Math.round((answered * 100) / total);
}

// ─── Input ──────────────────────────────────────────────────────────────────

/** Fields left out are unchanged; an empty phone (or null) removes it. */
export const updateProfileSchema = z
  .object({
    fullName: fullNameSchema,
    phone: phoneSchema.nullable(),
  })
  .partial();

export const setAvatarSchema = z.object({
  /** `key` from `POST /uploads` with purpose AVATAR */
  uploadKey: z.string().min(1).max(300),
});

export const userIdParamSchema = z.object({ id: z.uuid() });

// ─── Output ─────────────────────────────────────────────────────────────────

const timestamp = z.iso.datetime({ offset: true });

/** The signed-in user's own profile (`/tai-khoan`). */
export const myProfileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  emailVerified: z.boolean(),
  fullName: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  /** From the submitted driver license; null until one is submitted. */
  dateOfBirth: z.iso.date().nullable(),
  joinedAt: timestamp,
});

/** What anyone can see (`/nguoi-dung/[id]`): never the email, phone or birth date. */
export const publicProfileSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  avatarUrl: z.url().nullable(),
  joinedAt: timestamp,
  /** Completed trips, as renter and as owner. */
  tripCount: z.int(),
  /** Published reviews received, as renter and as owner. Average is null without reviews. */
  rating: z.object({ average: z.number().nullable(), count: z.int() }),
  /** Percent; null when the user had no booking requests to answer in the last 90 days. */
  responseRate: z.int().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SetAvatarInput = z.infer<typeof setAvatarSchema>;
export type MyProfile = z.infer<typeof myProfileSchema>;
export type PublicProfile = z.infer<typeof publicProfileSchema>;
