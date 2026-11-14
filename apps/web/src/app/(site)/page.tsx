import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { routes } from '@/lib/navigation';
import { cn } from '@/lib/utils';

// Placeholder until the home page (CARENTA-25).
export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Thuê xe tự lái từ chủ xe <span className="text-primary">trên khắp Việt Nam</span>
      </h1>
      <p className="max-w-md text-muted-foreground">
        Nền tảng thuê xe tự lái đang được xây dựng. Hẹn gặp lại bạn sớm!
      </p>
      <Link href={routes.search} className={cn(buttonVariants({ size: 'lg' }))}>
        Tìm xe
      </Link>
    </div>
  );
}
