import { Loader2Icon } from 'lucide-react';

/** Centred spinner for a whole page or panel that is still loading. */
export function PageSpinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    // <output> carries the "status" role, so screen readers announce the label.
    <output className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
      <Loader2Icon className="size-6 animate-spin text-primary" aria-hidden />
      <span>{label}</span>
    </output>
  );
}
