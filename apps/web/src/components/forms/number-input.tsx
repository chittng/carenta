'use client';

import { type ComponentProps, useState } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const vndDigits = new Intl.NumberFormat('vi-VN');

type BaseProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'>;

/**
 * Whole-number field for react-hook-form: shows `1.500.000` while typing (`money`), hands the
 * form a number, or null when empty, so zod gets the type it validates. Optional `suffix`
 * such as "đ" or "km".
 */
export function NumberInput({
  value,
  onChange,
  suffix,
  money = false,
  className,
  ...props
}: BaseProps & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  suffix?: string;
  /** Group thousands with dots, as money is written in Vietnamese. */
  money?: boolean;
}) {
  const shown =
    value === null || value === undefined || Number.isNaN(value)
      ? ''
      : money
        ? vndDigits.format(value)
        : String(value);

  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        value={shown}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '');
          onChange(digits === '' ? null : Number(digits));
        }}
        className={cn('h-10', suffix && 'pr-12', className)}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}

/**
 * Number with a decimal part, typed the Vietnamese way (`6,5`). Keeps the text as typed so
 * a trailing comma survives; the form gets the parsed number.
 */
export function DecimalInput({
  value,
  onChange,
  suffix,
  className,
  ...props
}: BaseProps & {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  suffix?: string;
}) {
  const [text, setText] = useState(() =>
    value === null || value === undefined ? '' : String(value).replace('.', ','),
  );
  return (
    <div className="relative">
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.,]/g, '');
          setText(next);
          const parsed = Number.parseFloat(next.replace(',', '.'));
          onChange(next === '' || Number.isNaN(parsed) ? null : parsed);
        }}
        className={cn('h-10', suffix && 'pr-24', className)}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );
}
