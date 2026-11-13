import { describe, expect, it } from 'vitest';

import { createUploadSchema, UPLOAD_MAX_BYTES } from './index.js';

describe('createUploadSchema', () => {
  const valid = { purpose: 'CAR_PHOTO', contentType: 'image/jpeg', size: 2_000_000 };

  it('accepts a JPEG, PNG or WebP image up to the size limit', () => {
    expect(createUploadSchema.parse(valid)).toEqual(valid);
    expect(createUploadSchema.safeParse({ ...valid, contentType: 'image/png' }).success).toBe(true);
    expect(createUploadSchema.safeParse({ ...valid, contentType: 'image/webp' }).success).toBe(
      true,
    );
    expect(createUploadSchema.safeParse({ ...valid, size: UPLOAD_MAX_BYTES }).success).toBe(true);
  });

  it.each([
    ['image/heic', 'Chỉ nhận ảnh JPG, PNG hoặc WebP.'],
    ['application/pdf', 'Chỉ nhận ảnh JPG, PNG hoặc WebP.'],
  ])('rejects content type %s', (contentType, message) => {
    const result = createUploadSchema.safeParse({ ...valid, contentType });

    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it.each([
    [UPLOAD_MAX_BYTES + 1, 'Ảnh tối đa 10 MB.'],
    [0, 'Tệp rỗng.'],
  ])('rejects size %d', (size, message) => {
    const result = createUploadSchema.safeParse({ ...valid, size });

    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it('rejects an unknown purpose', () => {
    expect(createUploadSchema.safeParse({ ...valid, purpose: 'PASSPORT' }).success).toBe(false);
  });
});
