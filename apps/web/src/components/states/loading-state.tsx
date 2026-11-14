import { Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A spinner with a label, for a page or panel whose content has no predictable shape yet.
 * Lists and cards should prefer `Skeleton` placeholders in their own layout.
 */
export function LoadingState({
  label = 'Đang tải…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    // <output> carries the "status" role, so screen readers announce the label.
    <output
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2Icon className="size-6 animate-spin text-primary" aria-hidden />
      <span>{label}</span>
    </output>
  );
}
