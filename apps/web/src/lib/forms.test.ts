import { type UseFormSetError } from 'react-hook-form';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { ErrorCode, type LoginInput, loginSchema } from '@carenta/shared';

import { ApiRequestError } from './api/errors';
import { applyApiError, SERVER_ERROR_FIELD, useZodForm } from './forms';

interface Values {
  email: string;
  pricing: { weekdayPrice: number };
}

const FIELDS = ['email', 'pricing.weekdayPrice'] as const;

function validation(details: { path: string; message: string }[]) {
  return new ApiRequestError(400, ErrorCode.VALIDATION_FAILED, 'Dữ liệu không hợp lệ.', details);
}

describe('applyApiError', () => {
  it('puts validation details on their fields and focuses the first', () => {
    const setError = vi.fn<UseFormSetError<Values>>();
    const handled = applyApiError<Values>(
      validation([
        { path: 'email', message: 'Email không hợp lệ.' },
        { path: 'pricing.weekdayPrice', message: 'Giá phải lớn hơn 0.' },
      ]),
      setError,
      FIELDS,
    );

    expect(handled).toBe(true);
    expect(setError.mock.calls).toEqual([
      ['email', { type: 'server', message: 'Email không hợp lệ.' }, { shouldFocus: true }],
      [
        'pricing.weekdayPrice',
        { type: 'server', message: 'Giá phải lớn hơn 0.' },
        { shouldFocus: false },
      ],
    ]);
  });

  it('shows details for paths that are not fields on the form as a whole', () => {
    const setError = vi.fn<UseFormSetError<Values>>();
    applyApiError<Values>(
      validation([
        { path: 'email', message: 'Email không hợp lệ.' },
        { path: 'requestId', message: 'Mã yêu cầu không hợp lệ.' },
      ]),
      setError,
      FIELDS,
    );
    expect(setError).toHaveBeenCalledTimes(2);
    expect(setError).toHaveBeenLastCalledWith(SERVER_ERROR_FIELD, {
      type: 'server',
      message: 'Mã yêu cầu không hợp lệ.',
    });
  });

  it('shows business errors on the form as a whole', () => {
    const setError = vi.fn<UseFormSetError<Values>>();
    applyApiError<Values>(
      new ApiRequestError(409, ErrorCode.EMAIL_TAKEN, 'Email này đã được đăng ký.'),
      setError,
      FIELDS,
    );
    expect(setError.mock.calls).toEqual([
      [SERVER_ERROR_FIELD, { type: 'server', message: 'Email này đã được đăng ký.' }],
    ]);
  });

  it('leaves non-API errors to the caller', () => {
    const setError = vi.fn<UseFormSetError<Values>>();
    expect(applyApiError<Values>(new Error('boom'), setError, FIELDS)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});

// Type-level only: never rendered.
const useLoginForm = () => useZodForm(loginSchema);

describe('useZodForm', () => {
  it('types fields as the schema input and submitted data as its output', () => {
    type Form = ReturnType<typeof useLoginForm>;
    expectTypeOf<Parameters<Form['register']>[0]>().toEqualTypeOf<'email' | 'password'>();
    expectTypeOf<Parameters<Parameters<Form['handleSubmit']>[0]>[0]>().toEqualTypeOf<LoginInput>();
  });
});
