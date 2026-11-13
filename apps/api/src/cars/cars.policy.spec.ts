import { CarStatus } from '@carenta/shared';

import {
  canDelete,
  canSubmit,
  editMode,
  enforcesPhotoMinimum,
  missingForSubmission,
  pausedStatus,
  resumedStatus,
} from './cars.policy.js';

describe('car status rules', () => {
  it.each([
    [CarStatus.DRAFT, 'direct', true, true],
    [CarStatus.PENDING_REVIEW, 'direct', false, false],
    [CarStatus.REJECTED, 'direct', true, true],
    [CarStatus.ACTIVE, 'revision', false, false],
    [CarStatus.PAUSED, 'revision', false, false],
    [CarStatus.HIDDEN, 'revision', false, false],
    [CarStatus.REMOVED, 'locked', false, false],
  ] as const)('%s: edits are %s, delete %s, submit %s', (status, mode, deletable, submittable) => {
    expect(editMode(status)).toBe(mode);
    expect(canDelete(status)).toBe(deletable);
    expect(canSubmit(status)).toBe(submittable);
    expect(enforcesPhotoMinimum(status)).toBe(mode === 'revision');
  });

  it.each(Object.values(CarStatus))(
    '%s: pauses only if listed, resumes only if paused',
    (status) => {
      expect(pausedStatus(status)).toBe(status === CarStatus.ACTIVE ? CarStatus.PAUSED : null);
      expect(resumedStatus(status)).toBe(status === CarStatus.PAUSED ? CarStatus.ACTIVE : null);
    },
  );
});

describe('missingForSubmission', () => {
  // 14 Nov 2026, 23:30 in Vietnam (still 16:30 UTC)
  const now = new Date('2026-11-14T16:30:00Z');
  const complete = {
    photoCount: 4,
    documents: [
      { type: 'REGISTRATION', expiresOn: null },
      { type: 'INSPECTION', expiresOn: '2026-11-14' },
    ],
  } as const;

  it('accepts 4 photos, the registration and an inspection valid through today', () => {
    expect(missingForSubmission({ ...complete, documents: [...complete.documents] }, now)).toEqual(
      [],
    );
  });

  it('lists everything that is missing', () => {
    expect(missingForSubmission({ photoCount: 3, documents: [] }, now)).toEqual([
      { path: 'photos', message: 'Cần ít nhất 4 ảnh xe.' },
      { path: 'documents.REGISTRATION', message: 'Cần ảnh giấy đăng ký xe.' },
      { path: 'documents.INSPECTION', message: 'Cần ảnh giấy đăng kiểm.' },
    ]);
  });

  it('rejects an inspection that expired yesterday in Vietnam', () => {
    const documents = [
      { type: 'REGISTRATION', expiresOn: null },
      { type: 'INSPECTION', expiresOn: '2026-11-14' },
    ] as const;
    // 15 Nov 00:30 in Vietnam
    const nextDay = new Date('2026-11-14T17:30:00Z');

    expect(missingForSubmission({ photoCount: 4, documents: [...documents] }, nextDay)).toEqual([
      {
        path: 'documents.INSPECTION',
        message: 'Giấy đăng kiểm đã hết hạn. Vui lòng tải lên giấy đăng kiểm mới.',
      },
    ]);
  });
});
