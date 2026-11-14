'use client';

import { MailWarningIcon, XIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { useResendVerification, useSession } from '@/lib/session';

const DISMISS_KEY = 'carenta.verify-email-banner.dismissed';
const listeners = new Set<() => void>();

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Storage blocked (private mode): the banner just hides until the next page load.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reminder for a signed-in user whose email is not verified (spec §3). It can be closed
 * for the rest of the browser session (decided 2026-11-14); blocked actions still show
 * their own reminder with a resend button.
 */
export function EmailVerificationBanner() {
  const pathname = usePathname();
  const { data: user } = useSession();
  const resend = useResendVerification();
  // Hidden for the rest of this tab's session, or after dismissing in another component.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);

  if (!user || user.emailVerified || dismissed || pathname === '/xac-thuc-email') return null;

  return (
    <div className="border-b border-warning-border bg-warning text-warning-foreground">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-2.5 text-sm sm:items-center">
        <MailWarningIcon className="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden />
        <p className="flex-1">
          Xác thực email để đặt xe, đăng xe, nộp GPLX và nhắn tin. Link đã được gửi tới{' '}
          <span className="font-medium break-all">{user.email}</span>.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-warning-border bg-transparent hover:bg-warning-border/50"
          disabled={resend.isPending}
          onClick={() => resend.mutate()}
        >
          {resend.isPending ? 'Đang gửi…' : 'Gửi lại'}
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Ẩn nhắc nhở xác thực email"
          className="-mr-1 shrink-0 rounded-md p-1 outline-none hover:bg-warning-border/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <XIcon className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
