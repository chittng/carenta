'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { FormError } from '@/components/auth/form-error';
import { FormField, selectClassName } from '@/components/forms/form-field';
import { DecimalInput, NumberInput } from '@/components/forms/number-input';
import { QueryState } from '@/components/states/query-state';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api/client';
import { applyApiError, useZodForm } from '@/lib/forms';
import { useCarMakes, useSetOwnerCar } from '@/lib/owner-cars';
import {
  BODY_TYPE_LABELS,
  BodyType,
  CAR_SEATS_MAX,
  CAR_SEATS_MIN,
  createCarSchema,
  ErrorCode,
  FUEL_TYPE_LABELS,
  FuelType,
  type OwnerCar,
  TRANSMISSION_LABELS,
  Transmission,
} from '@carenta/shared';

import { StepActions } from './step-actions';

const basicSchema = createCarSchema.pick({
  modelId: true,
  year: true,
  licensePlate: true,
  color: true,
  bodyType: true,
  seats: true,
  transmission: true,
  fuelType: true,
  fuelConsumption: true,
  odometerKm: true,
  description: true,
});

const REQUIRED_MESSAGES = {
  modelId: 'Vui lòng chọn hãng và dòng xe.',
  year: 'Vui lòng nhập năm sản xuất.',
  licensePlate: 'Vui lòng nhập biển số.',
  color: 'Vui lòng nhập màu xe.',
  bodyType: 'Vui lòng chọn kiểu thân xe.',
  seats: 'Vui lòng nhập số chỗ.',
  transmission: 'Vui lòng chọn hộp số.',
  fuelType: 'Vui lòng chọn nhiên liệu.',
  odometerKm: 'Vui lòng nhập số ODO.',
};

export type BasicValues = z.output<typeof basicSchema>;
type BasicInput = z.input<typeof basicSchema>;

const FIELDS = [
  'modelId',
  'year',
  'licensePlate',
  'color',
  'bodyType',
  'seats',
  'transmission',
  'fuelType',
  'fuelConsumption',
  'odometerKm',
  'description',
] as const;

/** Step 1: make, model and the rest of spec §4.1 "Cơ bản". */
export function BasicStep({
  car,
  initial,
  onDone,
}: {
  /** The saved draft, or null before the first save. */
  car: OwnerCar | null;
  /** Values typed before the first save, when coming back from step 2. */
  initial: BasicValues | null;
  onDone: (values: BasicValues) => void;
}) {
  const makes = useCarMakes();
  return (
    <QueryState query={makes} errorTitle="Không tải được danh sách hãng xe">
      {(data) => (
        <BasicForm
          car={car}
          initial={initial}
          onDone={onDone}
          makes={data}
          initialMakeId={
            car?.make.id ??
            data.find((make) => make.models.some((m) => m.id === initial?.modelId))?.id ??
            null
          }
        />
      )}
    </QueryState>
  );
}

function BasicForm({
  car,
  initial,
  onDone,
  makes,
  initialMakeId,
}: {
  car: OwnerCar | null;
  initial: BasicValues | null;
  onDone: (values: BasicValues) => void;
  makes: { id: number; name: string; models: { id: number; name: string }[] }[];
  initialMakeId: number | null;
}) {
  const setCar = useSetOwnerCar();
  const [makeId, setMakeId] = useState<number | null>(initialMakeId);
  const source = car ?? initial;
  const form = useZodForm<BasicInput, BasicValues>(basicSchema, {
    requiredMessages: REQUIRED_MESSAGES,
    defaultValues: source
      ? {
          modelId: car ? car.model.id : initial?.modelId,
          year: source.year,
          licensePlate: source.licensePlate,
          color: source.color,
          bodyType: source.bodyType,
          seats: source.seats,
          transmission: source.transmission,
          fuelType: source.fuelType,
          fuelConsumption: source.fuelConsumption ?? null,
          odometerKm: source.odometerKm,
          description: source.description ?? '',
        }
      : { description: '', fuelConsumption: null },
  });
  const models = makes.find((make) => make.id === makeId)?.models ?? [];
  const fuelType = form.watch('fuelType');

  const save = useMutation({
    mutationFn: (values: BasicValues) => api.patch<OwnerCar>(`/owner/cars/${car?.id}`, values),
    meta: { errorToast: false },
    onSuccess: (saved, values) => {
      setCar(saved);
      onDone(values);
    },
    onError: (error) => {
      applyApiError(error, form.setError, FIELDS, {
        [ErrorCode.LICENSE_PLATE_TAKEN]: 'licensePlate',
        [ErrorCode.CATALOG_ITEM_NOT_FOUND]: 'modelId',
      });
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) =>
        void form.handleSubmit((values) => (car ? save.mutate(values) : onDone(values)))(event)
      }
    >
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormError message={form.formState.errors.root?.server?.message} />
        <div className="flex flex-col gap-2">
          <label htmlFor="field-make" className="text-sm font-medium">
            Hãng xe
          </label>
          <select
            id="field-make"
            value={makeId ?? ''}
            onChange={(event) => {
              setMakeId(event.target.value ? Number(event.target.value) : null);
              form.resetField('modelId', { defaultValue: undefined });
            }}
            className={selectClassName}
          >
            <option value="" disabled>
              Chọn hãng
            </option>
            {makes.map((make) => (
              <option key={make.id} value={make.id}>
                {make.name}
              </option>
            ))}
          </select>
        </div>
        <FormField control={form.control} name="modelId" label="Dòng xe">
          {(field, { id, invalid }) => (
            <select
              id={id}
              name={field.name}
              ref={field.ref}
              value={field.value ?? ''}
              onChange={(event) => field.onChange(Number(event.target.value))}
              onBlur={field.onBlur}
              disabled={makeId === null}
              aria-invalid={invalid}
              className={selectClassName}
            >
              <option value="" disabled>
                {makeId === null ? 'Chọn hãng trước' : 'Chọn dòng xe'}
              </option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField control={form.control} name="year" label="Năm sản xuất">
          {(field, { id, invalid }) => (
            <NumberInput
              id={id}
              name={field.name}
              ref={field.ref}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder="2022"
              maxLength={4}
              aria-invalid={invalid}
            />
          )}
        </FormField>
        <FormField
          control={form.control}
          name="licensePlate"
          label="Biển số"
          description="Trang công khai chỉ hiện một phần, ví dụ 51K-***.45."
        >
          {(field, { id, invalid }) => (
            <Input
              {...field}
              value={field.value ?? ''}
              id={id}
              placeholder="51K-123.45"
              autoCapitalize="characters"
              aria-invalid={invalid}
              className="h-10 uppercase"
            />
          )}
        </FormField>
        <FormField control={form.control} name="color" label="Màu xe">
          {(field, { id, invalid }) => (
            <Input
              {...field}
              value={field.value ?? ''}
              id={id}
              placeholder="Trắng"
              aria-invalid={invalid}
              className="h-10"
            />
          )}
        </FormField>
        <EnumSelect
          control={form.control}
          name="bodyType"
          label="Kiểu thân xe"
          options={BodyType}
          labels={BODY_TYPE_LABELS}
        />
        <FormField control={form.control} name="seats" label="Số chỗ">
          {(field, { id, invalid }) => (
            <NumberInput
              id={id}
              name={field.name}
              ref={field.ref}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder={`${CAR_SEATS_MIN}–${CAR_SEATS_MAX}`}
              maxLength={2}
              aria-invalid={invalid}
            />
          )}
        </FormField>
        <EnumSelect
          control={form.control}
          name="transmission"
          label="Hộp số"
          options={Transmission}
          labels={TRANSMISSION_LABELS}
        />
        <EnumSelect
          control={form.control}
          name="fuelType"
          label="Nhiên liệu"
          options={FuelType}
          labels={FUEL_TYPE_LABELS}
        />
        <FormField
          control={form.control}
          name="fuelConsumption"
          label="Mức tiêu hao (không bắt buộc)"
        >
          {(field, { id, invalid }) => (
            <DecimalInput
              id={id}
              name={field.name}
              ref={field.ref}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              placeholder="6,5"
              suffix={fuelType === 'ELECTRIC' ? 'kWh/100km' : 'L/100km'}
              aria-invalid={invalid}
            />
          )}
        </FormField>
        <FormField control={form.control} name="odometerKm" label="Số ODO">
          {(field, { id, invalid }) => (
            <NumberInput
              id={id}
              name={field.name}
              ref={field.ref}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              money
              suffix="km"
              placeholder="35.000"
              aria-invalid={invalid}
            />
          )}
        </FormField>
        <FormField
          control={form.control}
          name="description"
          label="Mô tả (không bắt buộc)"
          className="sm:col-span-2"
          description="Giới thiệu xe, tình trạng, lưu ý cho người thuê."
        >
          {(field, { id, invalid }) => (
            <Textarea
              {...field}
              value={field.value ?? ''}
              id={id}
              rows={4}
              aria-invalid={invalid}
            />
          )}
        </FormField>
      </FieldGroup>
      <StepActions pending={save.isPending} />
    </form>
  );
}

function EnumSelect({
  control,
  name,
  label,
  options,
  labels,
}: {
  control: ReturnType<typeof useZodForm<BasicInput, BasicValues>>['control'];
  name: 'bodyType' | 'transmission' | 'fuelType';
  label: string;
  options: Record<string, string>;
  labels: Record<string, string>;
}) {
  return (
    <FormField control={control} name={name} label={label}>
      {(field, { id, invalid }) => (
        <select
          id={id}
          name={field.name}
          ref={field.ref}
          value={field.value ?? ''}
          onChange={(event) => field.onChange(event.target.value)}
          onBlur={field.onBlur}
          aria-invalid={invalid}
          className={selectClassName}
        >
          <option value="" disabled>
            Chọn
          </option>
          {Object.values(options).map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
