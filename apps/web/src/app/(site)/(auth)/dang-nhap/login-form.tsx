'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller } from 'react-hook-form';

import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/auth/form-error';
import { PasswordInput } from '@/components/auth/password-input';
import { useAuthRedirect } from '@/components/auth/use-auth-redirect';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { withNext } from '@/lib/auth-redirect';
import { applyApiError, useZodForm } from '@/lib/forms';
import { routes } from '@/lib/navigation';
import { SESSION_QUERY_KEY } from '@/lib/query-client';
import { type AuthUser, type LoginInput, loginSchema } from '@carenta/shared';

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const next = useAuthRedirect();
  const form = useZodForm(loginSchema, { defaultValues: { email: '', password: '' } });

  const login = useMutation({
    mutationFn: (input: LoginInput) => api.post<AuthUser>('/auth/login', input),
    meta: { errorToast: false },
    onSuccess: (user) => {
      queryClient.setQueryData(SESSION_QUERY_KEY, user);
      router.replace(next);
      router.refresh();
    },
    onError: (error) => {
      applyApiError(error, form.setError, ['email', 'password']);
    },
  });

  return (
    <AuthCard
      title="Đăng nhập"
      description="Chào mừng bạn quay lại Carenta."
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link
            href={withNext(routes.signUp, next)}
            className="font-medium text-primary hover:underline"
          >
            Đăng ký
          </Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => void form.handleSubmit((input) => login.mutate(input))(event)}
      >
        <FieldGroup>
          <FormError message={form.formState.errors.root?.server?.message} />
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="login-email">Email</FieldLabel>
                <Input
                  {...field}
                  id="login-email"
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
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="login-password">Mật khẩu</FieldLabel>
                  <Link href="/quen-mat-khau" className="text-sm text-primary hover:underline">
                    Quên mật khẩu?
                  </Link>
                </div>
                <PasswordInput
                  {...field}
                  id="login-password"
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                  className="h-10"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Button type="submit" size="lg" className="h-10 w-full" disabled={login.isPending}>
            {login.isPending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
