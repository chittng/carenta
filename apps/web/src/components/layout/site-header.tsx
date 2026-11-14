'use client';

import { MessageCircleIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Logo } from '@/components/brand/logo';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { headerNav, isActivePath, routes } from '@/lib/navigation';
import { signInHref, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

import { UserMenu } from './user-menu';

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 md:h-16">
        <Logo />
        <nav aria-label="Chính" className="hidden items-center gap-1 md:flex">
          {headerNav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActivePath(pathname, href) ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                'aria-[current=page]:text-primary',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <HeaderAccount pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

function HeaderAccount({ pathname }: { pathname: string }) {
  const { data: user, isPending, isError } = useSession();

  if (isPending) return <Skeleton className="size-9 rounded-full" />;

  if (!user || isError) {
    // Mobile keeps sign-up in the account tab to leave room for the logo.
    return (
      <>
        <Link
          href={signInHref(pathname === routes.home ? undefined : pathname)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))}
        >
          Đăng nhập
        </Link>
        <Link
          href={routes.signUp}
          className={cn(buttonVariants({ size: 'lg' }), 'hidden md:inline-flex')}
        >
          Đăng ký
        </Link>
      </>
    );
  }

  return (
    <div className="hidden items-center gap-1 md:flex">
      <Link
        href={routes.messages}
        aria-label="Tin nhắn"
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon-lg' }))}
      >
        <MessageCircleIcon aria-hidden />
      </Link>
      <UserMenu user={user} />
    </div>
  );
}
