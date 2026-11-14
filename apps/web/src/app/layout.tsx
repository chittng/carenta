import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';

import { Providers } from './providers';

import './globals.css';

// Designed for Vietnamese diacritics (decided 2026-11-14). Not a variable font, so the weights
// used by the UI are listed; next/font self-hosts them at build time.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-be-vietnam-pro',
});

export const metadata: Metadata = {
  title: { default: 'Carenta', template: '%s · Carenta' },
  description: 'Thuê xe tự lái từ chủ xe trên khắp Việt Nam',
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  // Lets the mobile tab bar sit above the iOS home indicator (env(safe-area-inset-bottom)).
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi" className={`h-full antialiased ${beVietnamPro.variable}`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
