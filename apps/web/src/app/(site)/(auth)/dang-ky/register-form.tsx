'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller } from 'react-hook-form';
import { toast } from 'sonner';

import { AuthCard } from '@/components/auth/auth-card';
import { FormError } from '@/components/auth/form-error';
import { PasswordInput } from '@/components/auth/password-input';
import { useAuthRedirect } from '@/components/auth/use-auth-redirect';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { withNext } from '@/lib/auth-redirect';
import { applyApiError, useZodForm } from '@/lib/forms';
import { routes } from '@/lib/navigation';
import { SESSION_QUERY_KEY } from '@/lib/query-client';
import { type AuthUser, ErrorCode, type RegisterInput, registerSchema } from '@carenta/shared';

export function RegisterForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const next = useAuthRedirect();
  const form = useZodForm(registerSchema, {
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const register = useMutation({
    mutationFn: (input: RegisterInput) => api.post<AuthUser>('/auth/register', input),
    meta: { errorToast: false },
    onSuccess: (user) => {
      // The API signs the new user in. Back to where they were (decided 2026-11-14); the
      // banner in the site layout reminds them to verify.
      queryClient.setQueryData(SESSION_QUERY_KEY, user);
      toast.success(`Đã tạo tài khoản. Hãy mở email gửi tới ${user.email} để xác thực.`);
      router.replace(next);
      router.refresh();
    },
    onError: (error) => {
      applyApiError(error, form.setError, ['fullName', 'email', 'password'], {
        [ErrorCode.EMAIL_TAKEN]: 'email',
      });
    },
  });

  return (
    <AuthCard
      title="Tạo tài khoản"
      description="Một tài khoản để thuê xe và cho thuê xe."
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link
            href={withNext(routes.signIn, next)}
            className="font-medium text-primary hover:underline"
          >
            Đăng nhập
          </Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => void form.handleSubmit((input) => register.mutate(input))(event)}
      >
        <FieldGroup>
          <FormError message={form.formState.errors.root?.server?.message} />
          <Controller
            control={form.control}
            name="fullName"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="register-name">Họ và tên</FieldLabel>
                <Input
                  {...field}
                  id="register-name"
                  autoComplete="name"
                  aria-invalid={fieldState.invalid}
                  className="h-10"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="register-email">Email</FieldLabel>
                <Input
                  {...field}
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={fieldState.invalid}
                  className="h-10"
                />
                <FieldDescription>Chúng tôi sẽ gửi link xác thực tới email này.</FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="register-password">Mật khẩu</FieldLabel>
                <PasswordInput
                  {...field}
                  id="register-password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                  className="h-10"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Button type="submit" size="lg" className="h-10 w-full" disabled={register.isPending}>
            {register.isPending ? 'Đang tạo tài khoản…' : 'Đăng ký'}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}
