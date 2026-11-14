'use client';

import { HomeIcon, LogOutIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LogoMark } from '@/components/brand/logo';
import { UserAvatar } from '@/components/layout/user-avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { consoleNav, isActivePath, routes } from '@/lib/navigation';
import { useLogout } from '@/lib/session';
import { type AuthUser } from '@carenta/shared';

function isActive(pathname: string, href: string): boolean {
  // The overview is the Console root, so it must not light up for every Console page.
  return href === routes.console ? pathname === href : isActivePath(pathname, href);
}

export function ConsoleSidebar({ admin }: { admin: AuthUser }) {
  const pathname = usePathname();
  const logout = useLogout();
  const { isMobile, setOpenMobile } = useSidebar();
  // The mobile sidebar is a sheet; close it once a page is picked.
  const onNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href={routes.console}
          onNavigate={onNavigate}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <LogoMark className="size-7" />
          <span className="text-lg font-bold tracking-tight">Console</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {consoleNav.map((group, index) => (
          <SidebarGroup key={group.label ?? index}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      isActive={isActive(pathname, href)}
                      render={<Link href={href} onNavigate={onNavigate} />}
                    >
                      <Icon aria-hidden />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href={routes.home} onNavigate={onNavigate} />}>
              <HomeIcon aria-hidden />
              <span>Về trang Carenta</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton disabled={logout.isPending} onClick={() => logout.mutate()}>
              <LogOutIcon aria-hidden />
              <span>Đăng xuất</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2 border-t px-2 pt-3">
          <UserAvatar fullName={admin.fullName} className="size-8" />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{admin.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
