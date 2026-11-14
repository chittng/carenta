'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon, MailIcon, MailWarningIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { AuthCard } from '@/components/auth/auth-card';
import { EmptyState } from '@/components/states/empty-state';
import { LoadingState } from '@/components/states/loading-state';
import { Button, buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { routes } from '@/lib/navigation';
import { SESSION_QUERY_KEY } from '@/lib/query-client';
import { signInHref, useResendVerification, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * `/xac-thuc-email?token=…` from the verification email (24 hours, single use). The token
 * is sent as soon as the page opens; without one, the page explains how to get a link.
 */
export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const queryClient = useQueryClient();
  const { data: user } = useSession();
  const verify = useMutation({
    mutationFn: (value: string) => api.post('/auth/verify-email', { token: value }),
    meta: { errorToast: false },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });

  // Once per token: the link is single use, and React runs effects twice in development.
  const sent = useRef<string | null>(null);
  const { mutate } = verify;
  useEffect(() => {
    if (!token || sent.current === token) return;
    sent.current = token;
    mutate(token);
  }, [token, mutate]);

  // Already verified (e.g. a used link opened again) is not an error for them.
  if (!token) return user?.emailVerified ? <Verified /> : <NoToken />;
  if (verify.isSuccess || (verify.isError && user?.emailVerified)) return <Verified />;

  if (verify.isError) {
    return (
      <AuthCard title="Không xác thực được email">
        <EmptyState
          icon={MailWarningIcon}
          title="Link không còn dùng được"
          description={errorMessage(verify.error)}
          className="p-0"
          action={<ResendAction />}
        />
      </AuthCard>
    );
  }

  return <LoadingState label="Đang xác thực email…" />;
}

function Verified() {
  return (
    <AuthCard title="Đã xác thực email">
      <EmptyState
        icon={CircleCheckIcon}
        title="Cảm ơn bạn!"
        description="Email của bạn đã được xác thực. Bạn có thể đặt xe, đăng xe, nộp GPLX và nhắn tin."
        className="p-0"
        action={
          <Link href={routes.home} className={cn(buttonVariants({ size: 'lg' }))}>
            Về trang chủ
          </Link>
        }
      />
    </AuthCard>
  );
}

function NoToken() {
  return (
    <AuthCard title="Xác thực email">
      <EmptyState
        icon={MailIcon}
        title="Mở link trong email của bạn"
        description="Chúng tôi đã gửi link xác thực tới email bạn dùng để đăng ký. Link có hiệu lực 24 giờ."
        className="p-0"
        action={<ResendAction />}
      />
    </AuthCard>
  );
}

/** Resend for a signed-in, unverified user; otherwise the next sensible step. */
function ResendAction() {
  const { data: user, isPending } = useSession();
  const resend = useResendVerification();

  if (isPending) return null;
  if (!user) {
    return (
      <Link href={signInHref('/xac-thuc-email')} className={cn(buttonVariants({ size: 'lg' }))}>
        Đăng nhập để gửi lại link
      </Link>
    );
  }
  if (user.emailVerified) {
    return (
      <Link href={routes.home} className={cn(buttonVariants({ size: 'lg' }))}>
        Email đã được xác thực. Về trang chủ
      </Link>
    );
  }
  return (
    <Button size="lg" disabled={resend.isPending} onClick={() => resend.mutate()}>
      {resend.isPending ? 'Đang gửi…' : `Gửi lại email tới ${user.email}`}
    </Button>
  );
}
