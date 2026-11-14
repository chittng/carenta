'use client';

import { LayoutDashboardIcon, LogOutIcon } from 'lucide-react';
import Link from 'next/link';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { accountNav, routes } from '@/lib/navigation';
import { useLogout } from '@/lib/session';
import { type AuthUser } from '@carenta/shared';

import { UserAvatar } from './user-avatar';

/** Desktop account menu behind the avatar in the header. */
export function UserMenu({ user }: { user: AuthUser }) {
  const logout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Mở menu tài khoản"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <UserAvatar fullName={user.fullName} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate font-medium text-foreground">{user.fullName}</span>
            <span className="truncate text-xs font-normal">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {accountNav.map(({ href, label, icon: Icon }) => (
            <DropdownMenuItem key={href} render={<Link href={href} />}>
              <Icon aria-hidden />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {user.role === 'ADMIN' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={routes.console} />}>
              <LayoutDashboardIcon aria-hidden />
              Console
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={logout.isPending} onClick={() => logout.mutate()}>
          <LogOutIcon aria-hidden />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
