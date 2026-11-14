'use client';

import { type ReactNode } from 'react';
import {
  type Control,
  Controller,
  type ControllerRenderProps,
  type FieldValues,
  type Path,
} from 'react-hook-form';

import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

/**
 * Label, control, description and error for one react-hook-form field, so step forms only
 * say what goes in the middle. `children` gets the field props and the id to use.
 */
export function FormField<Values extends FieldValues, Output, Name extends Path<Values>>({
  control,
  name,
  label,
  description,
  className,
  children,
}: {
  control: Control<Values, unknown, Output>;
  name: Name;
  label: ReactNode;
  description?: ReactNode;
  className?: string;
  children: (
    field: ControllerRenderProps<Values, Name>,
    state: { id: string; invalid: boolean },
  ) => ReactNode;
}) {
  const id = `field-${name.replaceAll('.', '-')}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={className}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {children(field, { id, invalid: fieldState.invalid })}
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}

/** Native select styled like the inputs; phones show their own picker. */
export const selectClassName =
  'h-10 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50 md:text-sm';
