import Link from 'next/link';

import { Logo } from '@/components/brand/logo';
import { buttonVariants } from '@/components/ui/button';
import { routes } from '@/lib/navigation';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Logo />
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="max-w-sm text-muted-foreground">Trang bạn tìm không tồn tại hoặc đã bị gỡ.</p>
      <Link href={routes.home} className={cn(buttonVariants({ size: 'lg' }))}>
        Về trang chủ
      </Link>
    </div>
  );
}
