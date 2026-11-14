import { z } from 'zod';

import { type Transmission } from './cars.js';
import { DriverLicenseStatus } from './console.js';
import { vietnamDate } from './time.js';

/** Driver licenses (GPLX, spec §3, §12.2). */

// ─── Classes ────────────────────────────────────────────────────────────────

/**
 * Classes that allow driving a car. Plain names are classes under the 2024 road traffic
 * law (licenses issued from 1/1/2025); LEGACY_* are the classes printed on older licenses,
 * still valid until they expire.
 */
export const DriverLicenseClass = {
  B: 'B',
  C1: 'C1',
  C: 'C',
  D1: 'D1',
  D2: 'D2',
  D: 'D',
  BE: 'BE',
  C1E: 'C1E',
  CE: 'CE',
  D1E: 'D1E',
  D2E: 'D2E',
  DE: 'DE',
  LEGACY_B1: 'LEGACY_B1',
  LEGACY_B2: 'LEGACY_B2',
  LEGACY_C: 'LEGACY_C',
  LEGACY_D: 'LEGACY_D',
  LEGACY_E: 'LEGACY_E',
  LEGACY_FB2: 'LEGACY_FB2',
  LEGACY_FC: 'LEGACY_FC',
  LEGACY_FD: 'LEGACY_FD',
  LEGACY_FE: 'LEGACY_FE',
} as const;
export type DriverLicenseClass = (typeof DriverLicenseClass)[keyof typeof DriverLicenseClass];

/** Display names, as printed on the license. */
export const DRIVER_LICENSE_CLASS_LABELS: Record<DriverLicenseClass, string> = {
  B: 'B',
  C1: 'C1',
  C: 'C',
  D1: 'D1',
  D2: 'D2',
  D: 'D',
  BE: 'BE',
  C1E: 'C1E',
  CE: 'CE',
  D1E: 'D1E',
  D2E: 'D2E',
  DE: 'DE',
  LEGACY_B1: 'B1 (cũ)',
  LEGACY_B2: 'B2 (cũ)',
  LEGACY_C: 'C (cũ)',
  LEGACY_D: 'D (cũ)',
  LEGACY_E: 'E (cũ)',
  LEGACY_FB2: 'FB2 (cũ)',
  LEGACY_FC: 'FC (cũ)',
  LEGACY_FD: 'FD (cũ)',
  LEGACY_FE: 'FE (cũ)',
};

/** Every class here allows cars up to 9 seats ("hạng B trở lên", spec §12.2). */
export const CAR_LICENSE_CLASSES: readonly DriverLicenseClass[] = Object.values(DriverLicenseClass);

/**
 * Classes that allow cars with 10 seats or more ("hạng D1 trở lên", spec §12.2):
 * D1 and above under the new law, D and E under the old one, with their trailer variants.
 */
export const LARGE_CAR_LICENSE_CLASSES: ReadonlySet<DriverLicenseClass> =
  new Set<DriverLicenseClass>([
    'D1',
    'D2',
    'D',
    'D1E',
    'D2E',
    'DE',
    'LEGACY_D',
    'LEGACY_E',
    'LEGACY_FD',
    'LEGACY_FE',
  ]);

/** The old B1 only allows automatic cars (spec §12.2). */
export const AUTOMATIC_ONLY_LICENSE_CLASSES: ReadonlySet<DriverLicenseClass> =
  new Set<DriverLicenseClass>(['LEGACY_B1']);

/** Cars with this many seats or more need a D1-or-above license. */
export const LARGE_CAR_MIN_SEATS = 10;
export const MIN_RENTER_AGE = 18;

/** The holder is emailed this many days before the license expires (spec §12.2). */
export const DRIVER_LICENSE_EXPIRY_REMINDER_DAYS = 30;

// ─── Eligibility ────────────────────────────────────────────────────────────

export const RentalEligibilityIssue = {
  NO_LICENSE: 'NO_LICENSE',
  LICENSE_NOT_APPROVED: 'LICENSE_NOT_APPROVED',
  UNDER_AGE: 'UNDER_AGE',
  AUTOMATIC_ONLY: 'AUTOMATIC_ONLY',
  CLASS_TOO_LOW: 'CLASS_TOO_LOW',
  EXPIRES_BEFORE_RETURN: 'EXPIRES_BEFORE_RETURN',
} as const;
export type RentalEligibilityIssue =
  (typeof RentalEligibilityIssue)[keyof typeof RentalEligibilityIssue];

export interface EligibilityLicense {
  status: DriverLicenseStatus;
  licenseClass: DriverLicenseClass;
  /** `YYYY-MM-DD` */
  dateOfBirth: string;
  /** `YYYY-MM-DD`, valid through that day */
  expiresOn: string;
}

export interface EligibilityInput {
  /** The renter's current license (approved or expired); null if none. */
  license: EligibilityLicense | null;
  car: { transmission: Transmission; seats: number };
  /** Vietnam dates, `YYYY-MM-DD`. */
  pickupDate: string;
  returnDate: string;
}

/** Age in whole years on `date` (both `YYYY-MM-DD`); a 29 February birthday counts on 1 March. */
export function ageOn(dateOfBirth: string, date: string): number {
  const [by = 0, bm = 1, bd = 1] = dateOfBirth.split('-').map(Number);
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const hadBirthday = m > bm || (m === bm && d >= bd);
  return y - by - (hadBirthday ? 0 : 1);
}

/**
 * Whether a renter may drive this car for this trip (spec §12.2), as a list of problems,
 * empty when they may. The license must be approved, the renter at least 18 on the
 * pickup day ([Đề xuất]), the class must allow the car (old B1: automatic only; 10 seats
 * or more: D1 or above) and the license must stay valid through the return day.
 */
export function rentalEligibilityIssues(
  input: EligibilityInput,
): { code: RentalEligibilityIssue; message: string }[] {
  const { license, car } = input;
  if (license === null) {
    return [
      {
        code: RentalEligibilityIssue.NO_LICENSE,
        message: 'Bạn cần nộp GPLX và được duyệt trước khi đặt xe.',
      },
    ];
  }
  if (license.status !== DriverLicenseStatus.APPROVED) {
    return [
      {
        code: RentalEligibilityIssue.LICENSE_NOT_APPROVED,
        message:
          license.status === DriverLicenseStatus.EXPIRED
            ? 'GPLX của bạn đã hết hạn. Vui lòng nộp GPLX mới.'
            : 'GPLX của bạn chưa được duyệt.',
      },
    ];
  }

  const issues: { code: RentalEligibilityIssue; message: string }[] = [];
  if (ageOn(license.dateOfBirth, input.pickupDate) < MIN_RENTER_AGE) {
    issues.push({
      code: RentalEligibilityIssue.UNDER_AGE,
      message: `Người thuê phải đủ ${MIN_RENTER_AGE} tuổi vào ngày nhận xe.`,
    });
  }
  if (car.transmission === 'MANUAL' && AUTOMATIC_ONLY_LICENSE_CLASSES.has(license.licenseClass)) {
    issues.push({
      code: RentalEligibilityIssue.AUTOMATIC_ONLY,
      message: 'GPLX hạng B1 cũ chỉ được lái xe số tự động.',
    });
  }
  if (car.seats >= LARGE_CAR_MIN_SEATS && !LARGE_CAR_LICENSE_CLASSES.has(license.licenseClass)) {
    issues.push({
      code: RentalEligibilityIssue.CLASS_TOO_LOW,
      message: `Xe từ ${LARGE_CAR_MIN_SEATS} chỗ trở lên cần GPLX hạng D1 trở lên.`,
    });
  }
  if (license.expiresOn < input.returnDate) {
    issues.push({
      code: RentalEligibilityIssue.EXPIRES_BEFORE_RETURN,
      message: 'GPLX của bạn hết hạn trước ngày trả xe.',
    });
  }
  return issues;
}

// ─── Input ──────────────────────────────────────────────────────────────────

/**
 * [Đề xuất] License numbers are 12 digits (every license issued since 2013, including the
 * PET card); spaces are ignored.
 */
export const licenseNumberSchema = z
  .string()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{12}$/, { error: 'Số GPLX gồm 12 chữ số.' }));

/** Submitting a license (spec §3): both sides, the details printed on it, for review. */
export const submitDriverLicenseSchema = z.object({
  /** Name as printed on the license. */
  fullName: z
    .string()
    .trim()
    .min(1, { error: 'Vui lòng nhập họ tên trên GPLX.' })
    .max(100, { error: 'Họ tên tối đa 100 ký tự.' }),
  licenseNumber: licenseNumberSchema,
  licenseClass: z.enum(DriverLicenseClass, { error: 'Hạng GPLX không hợp lệ.' }),
  /** [Đề xuất] The holder must already be 18. */
  dateOfBirth: z.iso
    .date({ error: 'Ngày sinh không hợp lệ.' })
    .refine((date) => ageOn(date, vietnamDate()) >= MIN_RENTER_AGE, {
      error: `Người thuê phải đủ ${MIN_RENTER_AGE} tuổi.`,
    })
    .refine((date) => ageOn(date, vietnamDate()) <= 100, { error: 'Ngày sinh không hợp lệ.' }),
  /** Valid through this day; must not have passed. */
  expiresOn: z.iso
    .date({ error: 'Ngày hết hạn không hợp lệ.' })
    .refine((date) => date >= vietnamDate(), { error: 'GPLX đã hết hạn.' }),
  /** `key`s from `POST /uploads` with purpose DRIVER_LICENSE */
  frontUploadKey: z.string().min(1).max(300),
  backUploadKey: z.string().min(1).max(300),
});

// ─── Output ─────────────────────────────────────────────────────────────────

const timestamp = z.iso.datetime({ offset: true });

export const driverLicenseSchema = z.object({
  id: z.uuid(),
  status: z.enum(DriverLicenseStatus),
  fullName: z.string(),
  licenseNumber: z.string(),
  licenseClass: z.enum(DriverLicenseClass),
  dateOfBirth: z.iso.date(),
  expiresOn: z.iso.date(),
  /** Presigned, valid for 5 minutes. */
  frontImageUrl: z.url(),
  backImageUrl: z.url(),
  rejectionReason: z.string().nullable(),
  submittedAt: timestamp,
  reviewedAt: timestamp.nullable(),
});

/**
 * The user's licenses: the one in use for renting (approved, or expired), and a newer
 * submission waiting for review or rejected. Either can be null.
 */
export const myDriverLicensesSchema = z.object({
  current: driverLicenseSchema.nullable(),
  submission: driverLicenseSchema.nullable(),
});

export const consoleDriverLicenseListQuerySchema = z.object({
  status: z.enum(DriverLicenseStatus).default(DriverLicenseStatus.PENDING),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const userRefSchema = z.object({ id: z.uuid(), fullName: z.string(), email: z.email() });

/** A row in the Console queue; pending ones oldest first. */
export const consoleDriverLicenseSummarySchema = driverLicenseSchema
  .omit({ frontImageUrl: true, backImageUrl: true })
  .extend({
    user: userRefSchema,
    /** A renewal: the user already has an approved license. */
    isRenewal: z.boolean(),
  });

export const consoleDriverLicenseSchema = driverLicenseSchema.extend({
  user: userRefSchema,
  /** The approved (or expired) license this submission would replace, to compare. */
  current: driverLicenseSchema.nullable(),
  reviewedBy: userRefSchema.nullable(),
});

export type SubmitDriverLicenseInput = z.infer<typeof submitDriverLicenseSchema>;
export type DriverLicense = z.infer<typeof driverLicenseSchema>;
export type MyDriverLicenses = z.infer<typeof myDriverLicensesSchema>;
export type ConsoleDriverLicenseListQuery = z.infer<typeof consoleDriverLicenseListQuerySchema>;
export type ConsoleDriverLicenseSummary = z.infer<typeof consoleDriverLicenseSummarySchema>;
export type ConsoleDriverLicense = z.infer<typeof consoleDriverLicenseSchema>;
