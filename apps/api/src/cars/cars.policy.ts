import {
  type ApiErrorDetail,
  CAR_PHOTO_MIN,
  CarDocumentType,
  CarStatus,
  vietnamDate,
} from '@carenta/shared';

/**
 * How an owner's edit to a car is applied (spec §12.3, decided 2026-11-14):
 * - `direct`: the car has never been approved, so every change applies immediately.
 * - `revision`: the car has been approved; plate, make/model/year and documents go into a
 *   revision an admin must approve, everything else applies immediately.
 * - `locked`: taken down by an admin, nothing can change.
 *
 * [Đề xuất] A car waiting for its first review can still be edited directly: it is not
 * public yet and the admin reviews whatever is current when they decide.
 */
export type EditMode = 'direct' | 'revision' | 'locked';

const EDIT_MODES: Record<CarStatus, EditMode> = {
  DRAFT: 'direct',
  PENDING_REVIEW: 'direct',
  REJECTED: 'direct',
  ACTIVE: 'revision',
  PAUSED: 'revision',
  HIDDEN: 'revision',
  REMOVED: 'locked',
};

export function editMode(status: CarStatus): EditMode {
  return EDIT_MODES[status];
}

/** Only cars that were never approved can be deleted; listed cars can only be paused. */
export function canDelete(status: CarStatus): boolean {
  return status === CarStatus.DRAFT || status === CarStatus.REJECTED;
}

export function canSubmit(status: CarStatus): boolean {
  return status === CarStatus.DRAFT || status === CarStatus.REJECTED;
}

/** Pause hides a listed car from search; confirmed bookings are kept (spec §12.3). */
export function pausedStatus(status: CarStatus): CarStatus | null {
  return status === CarStatus.ACTIVE ? CarStatus.PAUSED : null;
}

export function resumedStatus(status: CarStatus): CarStatus | null {
  return status === CarStatus.PAUSED ? CarStatus.ACTIVE : null;
}

/** An approved car must keep the minimum number of photos; drafts may have fewer. */
export function enforcesPhotoMinimum(status: CarStatus): boolean {
  return editMode(status) === 'revision';
}

export interface SubmissionState {
  photoCount: number;
  hasPricing: boolean;
  /** The car's current documents (not those of a revision). */
  documents: { type: CarDocumentType; expiresOn: string | null }[];
}

/**
 * What is missing before a car can be sent for review: 4–15 photos, a price list, the
 * registration and an inspection that is still valid (decided 2026-11-14).
 */
export function missingForSubmission(state: SubmissionState, now = new Date()): ApiErrorDetail[] {
  const missing: ApiErrorDetail[] = [];
  if (state.photoCount < CAR_PHOTO_MIN) {
    missing.push({ path: 'photos', message: `Cần ít nhất ${CAR_PHOTO_MIN} ảnh xe.` });
  }
  if (!state.hasPricing) {
    missing.push({ path: 'pricing', message: 'Cần thiết lập bảng giá.' });
  }
  const registration = state.documents.find((d) => d.type === CarDocumentType.REGISTRATION);
  if (!registration) {
    missing.push({ path: 'documents.REGISTRATION', message: 'Cần ảnh giấy đăng ký xe.' });
  }
  const inspection = state.documents.find((d) => d.type === CarDocumentType.INSPECTION);
  if (!inspection) {
    missing.push({ path: 'documents.INSPECTION', message: 'Cần ảnh giấy đăng kiểm.' });
  } else if (inspection.expiresOn === null || inspection.expiresOn < vietnamDate(now)) {
    missing.push({
      path: 'documents.INSPECTION',
      message: 'Giấy đăng kiểm đã hết hạn. Vui lòng tải lên giấy đăng kiểm mới.',
    });
  }
  return missing;
}
