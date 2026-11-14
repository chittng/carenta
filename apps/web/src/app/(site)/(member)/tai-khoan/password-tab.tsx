'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { Controller } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Section } from '@/components/account/section';
import { FormError } from '@/components/auth/form-error';
import { PasswordInput } from '@/components/auth/password-input';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { api } from '@/lib/api/client';
import { applyApiError, useZodForm } from '@/lib/forms';
import { ErrorCode, passwordSchema } from '@carenta/shared';

/** No strength rules (spec §3); the new one is typed twice to catch typos. */
const changePasswordFormSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ['confirmPassword'],
    error: 'Mật khẩu nhập lại không khớp.',
  });

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function PasswordTab() {
  const form = useZodForm(changePasswordFormSchema, { defaultValues: EMPTY });

  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: z.output<typeof changePasswordFormSchema>) =>
      api.post('/auth/change-password', { currentPassword, newPassword }),
    meta: { errorToast: false },
    onSuccess: () => {
      form.reset(EMPTY);
      toast.success('Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.');
    },
    onError: (error) => {
      applyApiError(error, form.setError, ['currentPassword', 'newPassword'], {
        [ErrorCode.WRONG_PASSWORD]: 'currentPassword',
      });
    },
  });

  const fields = [
    { name: 'currentPassword', label: 'Mật khẩu hiện tại', autoComplete: 'current-password' },
    { name: 'newPassword', label: 'Mật khẩu mới', autoComplete: 'new-password' },
    { name: 'confirmPassword', label: 'Nhập lại mật khẩu mới', autoComplete: 'new-password' },
  ] as const;

  return (
    <Section
      title="Đổi mật khẩu"
      description="Sau khi đổi, các thiết bị khác sẽ bị đăng xuất; thiết bị này vẫn giữ đăng nhập."
    >
      <form
        noValidate
        onSubmit={(event) => void form.handleSubmit((input) => change.mutate(input))(event)}
      >
        <FieldGroup>
          <FormError message={form.formState.errors.root?.server?.message} />
          {fields.map(({ name, label, autoComplete }) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`password-${name}`}>{label}</FieldLabel>
                  <PasswordInput
                    {...field}
                    id={`password-${name}`}
                    autoComplete={autoComplete}
                    aria-invalid={fieldState.invalid}
                    className="h-10"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          ))}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/quen-mat-khau" className="text-sm text-primary hover:underline">
              Quên mật khẩu hiện tại?
            </Link>
            <Button type="submit" size="lg" disabled={change.isPending}>
              {change.isPending ? 'Đang lưu…' : 'Đổi mật khẩu'}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </Section>
  );
}
