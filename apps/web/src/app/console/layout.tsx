import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';

import { SessionRecovery } from '@/components/auth/session-recovery';
import { ConsoleSidebar } from '@/components/console/console-sidebar';
import { PageSpinner } from '@/components/layout/page-spinner';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getServerSessionUser } from '@/lib/api/server-session';

export const metadata: Metadata = {
  title: { default: 'Console', template: '%s · Console Carenta' },
  robots: { index: false, follow: false },
};

/**
 * Console for admins only. The session is read behind Suspense (Cache Components); a missing
 * or expired access cookie gets one browser-side refresh before the sign-in page, and a
 * signed-in non-admin gets a 404 so the Console's existence is not confirmed. The API checks
 * the ADMIN role on every Console endpoint regardless.
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <Suspense fallback={<PageSpinner />}>
        <AdminOnly>{children}</AdminOnly>
      </Suspense>
    </div>
  );
}

async function AdminOnly({ children }: { children: ReactNode }) {
  const user = await getServerSessionUser();
  if (!user) return <SessionRecovery />;
  if (user.role !== 'ADMIN') notFound();

  return (
    <TooltipProvider>
      <SidebarProvider>
        <ConsoleSidebar admin={user} />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger className="-ml-1" />
            <span className="font-semibold md:hidden">Console</span>
          </header>
          <div className="flex flex-1 flex-col p-4 md:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
