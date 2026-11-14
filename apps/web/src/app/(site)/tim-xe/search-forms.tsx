'use client';

import { MapPinIcon, SearchIcon } from 'lucide-react';
import { type UseFormReturn } from 'react-hook-form';
import { type z } from 'zod';

import { FormError } from '@/components/auth/form-error';
import { TripRangePicker } from '@/components/date-time/trip-range-picker';
import { FormField, selectClassName } from '@/components/forms/form-field';
import { NumberInput } from '@/components/forms/number-input';
import { QueryState } from '@/components/states/query-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { searchInput, searchParams } from '@/lib/car-search';
import { useZodForm } from '@/lib/forms';
import { useAmenities, useCarMakes } from '@/lib/owner-cars';
import {
  BODY_TYPE_LABELS,
  type CarSearchQuery,
  carSearchQuerySchema,
  FUEL_TYPE_LABELS,
  SEARCH_RADIUS_DEFAULT_KM,
  SEARCH_RADIUS_MAX_KM,
  TRANSMISSION_LABELS,
} from '@carenta/shared';

type SearchValues = z.input<typeof carSearchQuerySchema>;
type SearchForm = UseFormReturn<SearchValues, unknown, CarSearchQuery>;

function useSearchForm(query: CarSearchQuery) {
  return useZodForm(carSearchQuerySchema, { defaultValues: searchInput(searchParams(query)) });
}

/** Two independent forms share the API schema and preserve the other form's URL values. */
export function SearchBar({
  query,
  onApply,
}: {
  query: CarSearchQuery;
  onApply: (query: CarSearchQuery) => void;
}) {
  const form = useSearchForm(query);
  const startAt = form.watch('startAt');
  const endAt = form.watch('endAt');
  const hasPoint = form.watch('lat') !== undefined && form.watch('lng') !== undefined;
  function clearPoint() {
    form.setValue('lat', undefined);
    form.setValue('lng', undefined);
    form.setValue('radiusKm', undefined);
    if (form.getValues('sort') === 'distance') form.setValue('sort', undefined);
  }
  return (
    <form
      id="car-search-bar"
      onSubmit={(event) => void form.handleSubmit((value) => onApply({ ...value, page: 1 }))(event)}
      className="space-y-3 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.8fr_auto]">
        <FormField control={form.control} name="province" label="Tỉnh/thành">
          {(field, { id, invalid }) => (
            <Input
              {...field}
              value={field.value ?? ''}
              id={id}
              maxLength={100}
              placeholder="Ví dụ: Hồ Chí Minh"
              className="h-11"
              aria-invalid={invalid}
              onChange={(event) => {
                field.onChange(event);
                clearPoint();
              }}
            />
          )}
        </FormField>
        <FormField control={form.control} name="ward" label="Phường/xã">
          {(field, { id, invalid }) => (
            <Input
              {...field}
              value={field.value ?? ''}
              id={id}
              maxLength={100}
              placeholder="Tất cả phường/xã"
              className="h-11"
              aria-invalid={invalid}
              onChange={(event) => {
                field.onChange(event);
                clearPoint();
              }}
            />
          )}
        </FormField>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            Thời gian thuê <span className="font-normal text-muted-foreground">(tuỳ chọn)</span>
          </p>
          <TripRangePicker
            value={startAt && endAt ? { startAt: new Date(startAt), endAt: new Date(endAt) } : null}
            onChange={(range) => {
              form.setValue('startAt', range?.startAt.toISOString(), { shouldValidate: true });
              form.setValue('endAt', range?.endAt.toISOString(), { shouldValidate: true });
            }}
          />
        </div>
        <Button type="submit" className="h-11 px-5">
          <SearchIcon aria-hidden />
          Tìm xe
        </Button>
      </div>
      {hasPoint && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <MapPinIcon className="size-3.5" aria-hidden />
          Đang tìm quanh vị trí trên bản đồ, bán kính{' '}
          {Number(form.watch('radiusKm') ?? SEARCH_RADIUS_DEFAULT_KM)} km.
          <button
            type="button"
            className="text-primary underline underline-offset-2"
            onClick={clearPoint}
          >
            Bỏ vị trí trên bản đồ
          </button>
        </p>
      )}
      <FormErrors form={form} />
    </form>
  );
}

export function SearchFilters({
  query,
  onApply,
  onClear,
}: {
  query: CarSearchQuery;
  onApply: (query: CarSearchQuery) => void;
  onClear: () => void;
}) {
  const form = useSearchForm(query);
  const makes = useCarMakes();
  const amenities = useAmenities();
  return (
    <form
      id="car-search-filters"
      className="space-y-6"
      onSubmit={(event) => void form.handleSubmit((value) => onApply({ ...value, page: 1 }))(event)}
    >
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Giá quy đổi 1 ngày</legend>
        <FormField control={form.control} name="minPrice" label="Từ">
          {numberField({ money: true, suffix: 'đ' })}
        </FormField>
        <FormField control={form.control} name="maxPrice" label="Đến">
          {numberField({ money: true, suffix: 'đ' })}
        </FormField>
        <p className="text-xs text-muted-foreground">
          Giá lọc theo ngày, chưa gồm phí giao xe và tiền cọc.
        </p>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Hãng xe</legend>
        <QueryState query={makes} errorTitle="Không tải được hãng xe">
          {(items) => (
            <Choices
              form={form}
              name="makeIds"
              choices={items.map((item) => [String(item.id), item.name])}
            />
          )}
        </QueryState>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Kiểu thân xe</legend>
        <Choices form={form} name="bodyTypes" choices={Object.entries(BODY_TYPE_LABELS)} />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Số chỗ</legend>
        <div className="grid grid-cols-2 gap-2">
          <FormField control={form.control} name="seatsMin" label="Ít nhất">
            {numberField({})}
          </FormField>
          <FormField control={form.control} name="seatsMax" label="Tối đa">
            {numberField({})}
          </FormField>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Hộp số</legend>
        <Choices form={form} name="transmissions" choices={Object.entries(TRANSMISSION_LABELS)} />
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Nhiên liệu</legend>
        <Choices form={form} name="fuelTypes" choices={Object.entries(FUEL_TYPE_LABELS)} />
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Tuỳ chọn thuê</legend>
        <BooleanChoice form={form} name="instantBook" label="Đặt nhanh" />
        <BooleanChoice form={form} name="delivery" label="Giao tận nơi" />
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">Tiện nghi</legend>
        <p className="mb-3 text-xs text-muted-foreground">Xe có đủ các tiện nghi đã chọn.</p>
        <QueryState query={amenities} errorTitle="Không tải được tiện nghi">
          {(items) => (
            <Choices
              form={form}
              name="amenityIds"
              choices={items.map((item) => [String(item.id), item.name])}
            />
          )}
        </QueryState>
      </fieldset>
      {query.lat !== undefined && (
        <FormField
          control={form.control}
          name="radiusKm"
          label="Bán kính tìm kiếm"
          description={`Tối đa ${SEARCH_RADIUS_MAX_KM} km.`}
        >
          {numberField({ suffix: 'km', fallback: SEARCH_RADIUS_DEFAULT_KM })}
        </FormField>
      )}
      <FormErrors form={form} />
      <div className="sticky bottom-0 flex gap-2 border-t bg-background py-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" className="h-11" onClick={onClear}>
          Xoá bộ lọc
        </Button>
        <Button type="submit" className="h-11 flex-1">
          Áp dụng
        </Button>
      </div>
    </form>
  );
}

/** FormField's render-prop is returned by this small factory to keep numeric fields alike. */
function numberField({
  money,
  suffix,
  fallback,
}: {
  money?: boolean;
  suffix?: string;
  fallback?: number;
}) {
  return (
    field: {
      value: unknown;
      name: string;
      onChange: (value: number | undefined) => void;
      onBlur: () => void;
      ref: (element: HTMLInputElement | null) => void;
    },
    { id, invalid }: { id: string; invalid: boolean },
  ) => (
    <NumberInput
      {...field}
      id={id}
      value={field.value === undefined ? fallback : Number(field.value)}
      onChange={(value) => field.onChange(value ?? undefined)}
      money={money}
      suffix={suffix}
      aria-invalid={invalid}
    />
  );
}

function Choices({
  form,
  name,
  choices,
}: {
  form: SearchForm;
  name: 'makeIds' | 'bodyTypes' | 'transmissions' | 'fuelTypes' | 'amenityIds';
  choices: [string, string][];
}) {
  const raw = form.watch(name);
  const selected = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  return (
    <div className="grid max-h-56 gap-1 overflow-y-auto">
      {choices.map(([value, label]) => (
        <label
          key={value}
          className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-muted"
        >
          <Checkbox
            checked={selected.includes(value)}
            onCheckedChange={(checked) =>
              form.setValue(
                name,
                checked ? [...selected, value] : selected.filter((item) => item !== value),
                { shouldDirty: true },
              )
            }
          />
          {label}
        </label>
      ))}
    </div>
  );
}

function BooleanChoice({
  form,
  name,
  label,
}: {
  form: SearchForm;
  name: 'instantBook' | 'delivery';
  label: string;
}) {
  return (
    <FormField control={form.control} name={name} label={label}>
      {(field, { id, invalid }) => (
        <select
          {...field}
          id={id}
          value={field.value ?? ''}
          aria-invalid={invalid}
          onChange={(event) => field.onChange(event.target.value || undefined)}
          className={selectClassName}
        >
          <option value="">Tất cả</option>
          <option value="true">Có</option>
          <option value="false">Không</option>
        </select>
      )}
    </FormField>
  );
}

function FormErrors({ form }: { form: SearchForm }) {
  const messages = Object.values(form.formState.errors).flatMap((error) =>
    typeof error?.message === 'string' ? [error.message] : [],
  );
  return messages.length > 0 ? <FormError message={messages.join(' ')} /> : null;
}
