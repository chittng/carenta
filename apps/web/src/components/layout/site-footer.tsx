import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { routes } from '@/lib/navigation';

const columns = [
  {
    title: 'Khám phá',
    links: [
      { href: routes.search, label: 'Tìm xe' },
      { href: routes.myCars, label: 'Cho thuê xe' },
      { href: routes.guide, label: 'Hướng dẫn' },
    ],
  },
  {
    title: 'Chính sách',
    links: [
      { href: routes.cancellationPolicy, label: 'Chính sách huỷ' },
      { href: routes.terms, label: 'Điều khoản sử dụng' },
      { href: routes.privacy, label: 'Chính sách bảo mật' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Thuê xe tự lái từ chủ xe trên khắp Việt Nam.
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{column.title}</h2>
            <ul className="flex flex-col gap-2">
              {column.links.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground">© 2026 Carenta.</p>
      </div>
    </footer>
  );
}
