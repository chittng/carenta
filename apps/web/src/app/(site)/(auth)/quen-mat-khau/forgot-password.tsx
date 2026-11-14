'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon, MailCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { z } from 'zod';

import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/auth/form-error';
import { PasswordInput } from '@/components/auth/password-input';
import { EmptyState } from '@/components/states/empty-state';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { applyApiError, useZodForm } from '@/lib/forms';
import { routes } from '@/lib/navigation';
import { SESSION_QUERY_KEY } from '@/lib/query-client';
import { cn } from '@/lib/utils';
import {
  ErrorCode,
  type ForgotPasswordInput,
  forgotPasswordSchema,
  passwordSchema,
} from '@carenta/shared';

/**
 * `/quen-mat-khau`: without a token, asks for the email and sends a reset link; with the
 * `?token=` from that link (30 minutes, single use), sets a new password.
 */
export function ForgotPassword() {
  const token = useSearchParams().get('token');
  return token ? <ResetPasswordForm token={token} /> : <RequestLinkForm />;
}

function RequestLinkForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useZodForm(forgotPasswordSchema, { defaultValues: { email: '' } });

  const request = useMutation({
    mutationFn: (input: ForgotPasswordInput) => api.post('/auth/forgot-password', input),
    meta: { errorToast: false },
    onSuccess: (_, input) => setSentTo(input.email),
    onError: (error) => {
      applyApiError(error, form.setError, ['email']);
    },
  });

  if (sentTo) {
    return (
      <AuthCard title="Kiểm tra email của bạn">
        <EmptyState
          icon={MailCheckIcon}
          title="Đã nhận yêu cầu"
          // Same message whether or not the email has an account (spec §3).
          description={`Nếu ${sentTo} đã đăng ký Carenta, chúng tôi đã gửi link đặt lại mật khẩu tới email này. Link có hiệu lực 30 phút.`}
          className="p-0"
          action={
            <Button variant="outline" onClick={() => setSentTo(null)}>
              Dùng email khác
            </Button>
          }
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Quên mật khẩu"
      description="Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu."
      footer={
        <Link href={routes.signIn} className="font-medium text-primary hover:underline">
          Quay lại đăng nhập
        </Link>
      }
    >
      <form
        noValidate
        onSubmit={(event) => void form.handleSubmit((input) => request.mutate(input))(event)}
      >
        <FieldGroup>
          <FormError message={form.formState.errors.root?.server?.message} />
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
                <Input
                  {...field}
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={fieldState.invalid}
                  className="h-10"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Button type="submit" size="lg" className="h-10 w-full" disabled={request.isPending}>
            {request.isPending ? 'Đang gửi…' : 'Gửi link đặt lại mật khẩu'}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}

/** The new password typed twice; there are no strength rules (spec §3). */
const newPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((input) => input.password === input.confirmPassword, {
    path: ['confirmPassword'],
    error: 'Mật khẩu nhập lại không khớp.',
  });

function ResetPasswordForm({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const form = useZodForm(newPasswordSchema, {
    defaultValues: { password: '', confirmPassword: '' },
  });

  const reset = useMutation({
    mutationFn: (password: string) => api.post('/auth/reset-password', { token, password }),
    meta: { errorToast: false },
    onSuccess: () => {
      // Every device is signed out, this one included (spec §3).
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      setDone(true);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === ErrorCode.INVALID_LINK) {
        setLinkError(error.message);
        return;
      }
      applyApiError(error, form.setError, ['password']);
    },
  });

  if (done) {
    return (
      <AuthCard title="Đã đặt lại mật khẩu">
        <EmptyState
          icon={CircleCheckIcon}
          title="Mật khẩu mới đã được lưu"
          description="Bạn đã được đăng xuất khỏi mọi thiết bị. Hãy đăng nhập lại bằng mật khẩu mới."
          className="p-0"
          action={
            <Link href={routes.signIn} className={cn(buttonVariants({ size: 'lg' }))}>
              Đăng nhập
            </Link>
          }
        />
      </AuthCard>
    );
  }

  if (linkError) {
    return (
      <AuthCard title="Link không còn dùng được">
        <EmptyState
          title="Không đặt lại được mật khẩu"
          description={linkError}
          className="p-0"
          action={
            <Link href="/quen-mat-khau" className={cn(buttonVariants({ size: 'lg' }))}>
              Gửi link mới
            </Link>
          }
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Đặt mật khẩu mới"
      description="Sau khi đổi, bạn sẽ đăng nhập lại bằng mật khẩu mới."
    >
      <form
        noValidate
        onSubmit={(event) =>
          void form.handleSubmit(({ password }) => reset.mutate(password))(event)
        }
      >
        <FieldGroup>
          <FormError message={form.formState.errors.root?.server?.message} />
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="reset-password">Mật khẩu mới</FieldLabel>
                <PasswordInput
                  {...field}
                  id="reset-password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  className="h-10"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="confirmPassword"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="reset-confirm">Nhập lại mật khẩu mới</FieldLabel>
                <PasswordInput
                  {...field}
                  id="reset-confirm"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  className="h-10"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Button type="submit" size="lg" className="h-10 w-full" disabled={reset.isPending}>
            {reset.isPending ? 'Đang lưu…' : 'Đặt mật khẩu mới'}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
