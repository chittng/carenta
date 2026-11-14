'use client';

import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import { FormError } from '@/components/auth/form-error';
import { FormField } from '@/components/forms/form-field';
import { NumberInput } from '@/components/forms/number-input';
import { QueryState } from '@/components/states/query-state';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldGroup } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';
import { applyApiError, useZodForm } from '@/lib/forms';
import { useAmenities, useSetOwnerCar } from '@/lib/owner-cars';
import {
  type Amenity,
  CAR_RULE_LABELS,
  carRulesSchema,
  mileageLimitSchema,
  type OwnerCar,
  updateCarSchema,
} from '@carenta/shared';

import { type StepProps } from './car-wizard';
import { StepActions } from './step-actions';

const schema = z.object({
  amenityIds: updateCarSchema.shape.amenityIds.unwrap(),
  rules: carRulesSchema,
  mileageLimit: mileageLimitSchema.nullable(),
});
type Input = z.input<typeof schema>;
type Values = z.output<typeof schema>;

const RULE_KEYS = [
  'noSmoking',
  'noPets',
  'noDurianSeafood',
  'sameFuelLevel',
  'keepClean',
] as const satisfies readonly (keyof typeof CAR_RULE_LABELS)[];
/** Suggested when a mileage limit is switched on. */
const MILEAGE_DEFAULTS = { dailyKm: 300, extraFeePerKm: 3_000 };

/** Step 4: amenities, house rules and an optional mileage limit (spec §4.1). */
export function AmenitiesStep(props: StepProps) {
  const amenities = useAmenities();
  return (
    <QueryState query={amenities} errorTitle="Không tải được danh sách tiện nghi">
      {(data) => <AmenitiesForm {...props} amenities={data} />}
    </QueryState>
  );
}

function AmenitiesForm({ car, goNext, goBack, amenities }: StepProps & { amenities: Amenity[] }) {
  const setCar = useSetOwnerCar();
  const form = useZodForm<Input, Values>(schema, {
    defaultValues: {
      amenityIds: car.amenities.map((amenity) => amenity.id),
      rules: { ...car.rules, note: car.rules.note ?? '' },
      mileageLimit: car.mileageLimit,
    },
  });
  const selected = form.watch('amenityIds');
  const rules = form.watch('rules');
  const mileage = form.watch('mileageLimit');

  const save = useMutation({
    mutationFn: (values: Values) => api.patch<OwnerCar>(`/owner/cars/${car.id}`, values),
    meta: { errorToast: false },
    onSuccess: (saved) => {
      setCar(saved);
      goNext();
    },
    onError: (error) => {
      applyApiError(error, form.setError, [
        'rules.note',
        'mileageLimit.dailyKm',
        'mileageLimit.extraFeePerKm',
      ]);
    },
  });

  const toggleAmenity = (id: number, on: boolean) =>
    form.setValue('amenityIds', on ? [...selected, id] : selected.filter((value) => value !== id), {
      shouldDirty: true,
    });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => void form.handleSubmit((values) => save.mutate(values))(event)}
    >
      <FormError message={form.formState.errors.root?.server?.message} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-lg font-semibold">Tiện nghi</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {amenities.map((amenity) => {
            const id = `amenity-${amenity.id}`;
            return (
              <label
                key={amenity.id}
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-data-checked:border-primary has-data-checked:bg-primary/5"
              >
                <Checkbox
                  id={id}
                  checked={selected.includes(amenity.id)}
                  onCheckedChange={(on) => toggleAmenity(amenity.id, on)}
                />
                {amenity.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-lg font-semibold">Quy định xe</legend>
        <div className="flex flex-col divide-y rounded-lg border">
          {RULE_KEYS.map((key) => (
            <label
              key={key}
              className="flex min-h-11 cursor-pointer items-center justify-between gap-4 px-3 py-2 text-sm"
            >
              {CAR_RULE_LABELS[key]}
              <Switch
                checked={rules[key]}
                onCheckedChange={(on) => form.setValue(`rules.${key}`, on, { shouldDirty: true })}
                aria-label={CAR_RULE_LABELS[key]}
              />
            </label>
          ))}
        </div>
        <FormField control={form.control} name="rules.note" label="Ghi chú thêm (không bắt buộc)">
          {(field, { id, invalid }) => (
            <Textarea
              {...field}
              value={field.value ?? ''}
              id={id}
              rows={3}
              aria-invalid={invalid}
            />
          )}
        </FormField>
      </fieldset>

      <FieldGroup className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <span className="flex flex-col gap-1">
            <span className="font-semibold">Giới hạn km mỗi ngày</span>
            <span className="text-sm text-muted-foreground">
              Không bật thì người thuê đi không giới hạn quãng đường.
            </span>
          </span>
          <Switch
            checked={mileage !== null}
            onCheckedChange={(on) =>
              form.setValue('mileageLimit', on ? MILEAGE_DEFAULTS : null, { shouldDirty: true })
            }
            aria-label="Giới hạn km mỗi ngày"
          />
        </div>
        {mileage !== null && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField control={form.control} name="mileageLimit.dailyKm" label="Số km mỗi ngày">
              {(field, { id, invalid }) => (
                <NumberInput
                  id={id}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  suffix="km"
                  aria-invalid={invalid}
                />
              )}
            </FormField>
            <FormField
              control={form.control}
              name="mileageLimit.extraFeePerKm"
              label="Phụ phí mỗi km vượt"
            >
              {(field, { id, invalid }) => (
                <NumberInput
                  id={id}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  money
                  suffix="đ"
                  aria-invalid={invalid}
                />
              )}
            </FormField>
          </div>
        )}
      </FieldGroup>

      <StepActions onBack={goBack} pending={save.isPending} />
    </form>
  );
}
