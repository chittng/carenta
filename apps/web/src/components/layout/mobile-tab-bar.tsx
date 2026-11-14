'use client';

import { KeyRoundIcon, LayoutDashboardIcon, LogOutIcon, UserIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { accountNav, isActivePath, mobileTabs, routes } from '@/lib/navigation';
import { signInHref, useLogout, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

import { UserAvatar } from './user-avatar';

const tabClass =
  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium text-muted-foreground outline-none focus-visible:bg-accent aria-[current=page]:text-primary data-[active=true]:text-primary [&_svg]:size-5';

const sheetItemClass =
  'flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-50 aria-[current=page]:text-primary [&_svg]:size-5 [&_svg]:text-muted-foreground';

/** Bottom tab bar below `md` (decided 2026-11-14). The site layout leaves room for it. */
export function MobileTabBar() {
  const pathname = usePathname();
  // Pages reached from the account sheet light up the account tab.
  const inAccountSheet = accountNav.some(
    ({ href }) => isActivePath(pathname, href) && !mobileTabs.some((tab) => tab.href === href),
  );

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex h-16">
        {mobileTabs.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActivePath(pathname, href) ? 'page' : undefined}
            className={tabClass}
          >
            <Icon aria-hidden />
            <span className="truncate">{label}</span>
          </Link>
        ))}
        <AccountTab active={inAccountSheet} />
      </div>
    </nav>
  );
}

function AccountTab({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { data: user } = useSession();
  const logout = useLogout();
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger data-active={active} className={tabClass}>
        <UserIcon aria-hidden />
        <span className="truncate">Tài khoản</span>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        {user ? (
          <SheetHeader className="flex-row items-center gap-3 border-b">
            <UserAvatar fullName={user.fullName} className="size-10" />
            <div className="min-w-0">
              <SheetTitle className="truncate">{user.fullName}</SheetTitle>
              <SheetDescription className="truncate">{user.email}</SheetDescription>
            </div>
          </SheetHeader>
        ) : (
          <SheetHeader className="border-b">
            <SheetTitle>Tài khoản Carenta</SheetTitle>
            <SheetDescription>Đăng nhập để thuê xe, cho thuê xe và nhắn tin.</SheetDescription>
          </SheetHeader>
        )}

        <ul className="flex flex-col py-2">
          {user ? (
            <>
              {accountNav.map(({ href, label, icon: Icon }) => (
                <SheetLink key={href} href={href} onNavigate={close}>
                  <Icon aria-hidden />
                  {label}
                </SheetLink>
              ))}
              {user.role === 'ADMIN' && (
                <SheetLink href={routes.console} onNavigate={close}>
                  <LayoutDashboardIcon aria-hidden />
                  Console
                </SheetLink>
              )}
              <li>
                <button
                  type="button"
                  disabled={logout.isPending}
                  onClick={() => {
                    close();
                    logout.mutate();
                  }}
                  className={sheetItemClass}
                >
                  <LogOutIcon aria-hidden />
                  Đăng xuất
                </button>
              </li>
            </>
          ) : (
            <SheetLink href={routes.myCars} onNavigate={close}>
              <KeyRoundIcon aria-hidden />
              Cho thuê xe
            </SheetLink>
          )}
        </ul>

        {!user && (
          <div className="grid grid-cols-2 gap-2 border-t p-4">
            <Link
              href={signInHref(pathname)}
              onNavigate={close}
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
            >
              Đăng nhập
            </Link>
            <Link
              href={routes.signUp}
              onNavigate={close}
              className={cn(buttonVariants({ size: 'lg' }))}
            >
              Đăng ký
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <li>
      <Link
        href={href}
        onNavigate={onNavigate}
        aria-current={isActivePath(pathname, href) ? 'page' : undefined}
        className={sheetItemClass}
      >
        {children}
      </Link>
    </li>
  );
}
