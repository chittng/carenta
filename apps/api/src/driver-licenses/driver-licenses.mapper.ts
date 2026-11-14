import { type DriverLicense, DriverLicenseStatus } from '@carenta/shared';

import { toDateOnly } from '../common/dates.js';
import { type Prisma } from '../generated/prisma/client.js';
import { type UploadsService } from '../storage/uploads.service.js';

export type DriverLicenseRecord = Prisma.DriverLicenseGetPayload<object>;

/** Statuses of a user's license in use; the others are a submission (PENDING, REJECTED). */
export const CURRENT_STATUSES: readonly DriverLicenseStatus[] = [
  DriverLicenseStatus.APPROVED,
  DriverLicenseStatus.EXPIRED,
];
export const SUBMISSION_STATUSES: readonly DriverLicenseStatus[] = [
  DriverLicenseStatus.PENDING,
  DriverLicenseStatus.REJECTED,
];

/** Only call after checking the caller is the holder or an admin: the images are private. */
export async function toDriverLicense(
  uploads: UploadsService,
  license: DriverLicenseRecord,
): Promise<DriverLicense> {
  const [frontImageUrl, backImageUrl] = await Promise.all([
    uploads.privateUrl('DRIVER_LICENSE', license.frontImageKey),
    uploads.privateUrl('DRIVER_LICENSE', license.backImageKey),
  ]);
  return {
    id: license.id,
    status: license.status,
    fullName: license.fullName,
    licenseNumber: license.licenseNumber,
    licenseClass: license.licenseClass,
    dateOfBirth: toDateOnly(license.dateOfBirth),
    expiresOn: toDateOnly(license.expiresOn),
    frontImageUrl,
    backImageUrl,
    rejectionReason: license.rejectionReason,
    submittedAt: license.submittedAt.toISOString(),
    reviewedAt: license.reviewedAt?.toISOString() ?? null,
  };
}

/**
 * One status that sums up a user's licenses for Console: approved if they can rent,
 * otherwise what is waiting, then what has lapsed. Null when they never submitted one.
 */
export function overallLicenseStatus(
  statuses: readonly DriverLicenseStatus[],
): DriverLicenseStatus | null {
  const order = [
    DriverLicenseStatus.APPROVED,
    DriverLicenseStatus.PENDING,
    DriverLicenseStatus.EXPIRED,
    DriverLicenseStatus.REJECTED,
  ];
  return order.find((status) => statuses.includes(status)) ?? null;
}
