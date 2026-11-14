import { type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/** Back / save-and-continue row at the bottom of every wizard step. */
export function StepActions({
  onBack,
  submitLabel = 'Lưu và tiếp tục',
  pending = false,
  onNext,
  extra,
}: {
  onBack?: () => void;
  submitLabel?: string;
  pending?: boolean;
  /** Without it the main button submits the step's form. */
  onNext?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      {onBack ? (
        <Button type="button" variant="ghost" size="lg" onClick={onBack} disabled={pending}>
          Quay lại
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {extra}
        <Button
          type={onNext ? 'button' : 'submit'}
          size="lg"
          className="h-10"
          disabled={pending}
          onClick={onNext}
        >
          {pending ? 'Đang lưu…' : submitLabel}
        </Button>
      </div>
    </div>
  );
}
