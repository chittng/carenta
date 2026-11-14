import { EmailVerificationBanner } from '@/components/auth/email-verification-banner';
import { MobileTabBar } from '@/components/layout/mobile-tab-bar';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

/** Public and signed-in pages: header, footer, and the bottom tab bar on phones. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    // Bottom padding keeps the end of the page clear of the fixed mobile tab bar.
    <div className="flex min-h-dvh flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
      <SiteHeader />
      <EmailVerificationBanner />
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
