import Link from 'next/link';

import { cn } from '@/lib/utils';

/** The "Carenta" wordmark, linking home. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Carenta, về trang chủ"
      className={cn(
        'inline-flex items-center gap-2 rounded-md text-xl font-bold tracking-tight text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    >
      <LogoMark className="size-7" />
      <span>
        Car<span className="text-primary">enta</span>
      </span>
    </Link>
  );
}

/** Square brand mark: a white "C" on the brand blue. Also the app icon (app/icon.svg). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M21.5 11.2A7 7 0 1 0 21.5 20.8"
        fill="none"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
