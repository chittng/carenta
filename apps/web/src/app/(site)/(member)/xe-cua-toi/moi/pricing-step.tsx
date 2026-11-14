'use client';

import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

import { FormError } from '@/components/auth/form-error';
import { FormField, selectClassName } from '@/components/forms/form-field';
import { NumberInput } from '@/components/forms/number-input';
import { FieldGroup } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { applyApiError, useZodForm } from '@/lib/forms';
import { useSetOwnerCar } from '@/lib/owner-cars';
import { cn } from '@/lib/utils';
import {
  BUFFER_MAX_MINUTES,
  carPricingSchema,
  DEPOSIT_DEFAULT,
  DEPOSIT_MAX,
  effectiveLateFeePerHour,
  formatDuration,
  formatVnd,
  type OwnerCar,
  rentalSettingsFields,
  TIME_STEP_MINUTES,
} from '@carenta/shared';

import { type StepProps } from './car-wizard';
import { StepActions } from './step-actions';

const schema = z.object({
  pricing: carPricingSchema,
  instantBook: rentalSettingsFields.instantBook,
  depositAmount: rentalSettingsFields.depositAmount,
  bufferMinutes: rentalSettingsFields.bufferMinutes,
});
type Input = z.input<typeof schema>;
type Values = z.output<typeof schema>;

const UNITS = [
  { key: 'hourlyPrice', label: 'Theo giờ', suffix: 'đ/giờ' },
  { key: 'dailyPrice', label: 'Theo ngày', suffix: 'đ/ngày' },
  { key: 'monthlyPrice', label: 'Theo tháng', suffix: 'đ/tháng' },
] as const;

const BUFFER_OPTIONS = Array.from(
  { length: BUFFER_MAX_MINUTES / TIME_STEP_MINUTES + 1 },
  (_, i) => i * TIME_STEP_MINUTES,
);

const PRICING_FIELDS = [
  'pricing.hourlyPrice',
  'pricing.dailyPrice',
  'pricing.monthlyPrice',
  'pricing.minDurationHours',
  'pricing.maxDurationDays',
  'pricing.weekendSurchargePercent',
  'pricing.holidaySurchargePercent',
  'pricing.longRentalDiscountPercent',
  'pricing.lateFeePerHour',
] as const;

/** The price list answers with paths like `dailyPrice`; the form nests them under `pricing`. */
function underPricing(error: unknown): unknown {
  if (!(error instanceof ApiRequestError)) return error;
  return new ApiRequestError(
    error.status,
    error.code,
    error.message,
    error.details.map((detail) => ({ ...detail, path: `pricing.${detail.path}` })),
  );
}

/**
 * Step 5: the price list (spec §4.2), how bookings are approved (§4.5), the deposit (§4.6)
 * and the gap between trips (§4.3). Saves the price list, then the rental settings.
 */
export function PricingStep({ car, goNext, goBack }: StepProps) {
  const setCar = useSetOwnerCar();
  const p = car.pricing;
  const form = useZodForm<Input, Values>(schema, {
    defaultValues: {
      pricing: {
        hourlyPrice: p?.hourlyPrice ?? null,
        // A new car starts with only the daily price switched on.
        dailyPrice: p ? p.dailyPrice : 0,
        monthlyPrice: p?.monthlyPrice ?? null,
        minDurationHours: p?.minDurationHours ?? 24,
        maxDurationDays: p?.maxDurationDays ?? 30,
        weekendSurchargePercent: p?.weekendSurchargePercent ?? null,
        holidaySurchargePercent: p?.holidaySurchargePercent ?? null,
        longRentalDiscountPercent: p?.longRentalDiscountPercent ?? null,
        lateFeePerHour: p?.lateFeePerHour ?? null,
      },
      instantBook: car.instantBook,
      depositAmount: car.depositAmount,
      bufferMinutes: car.bufferMinutes,
    },
  });
  const pricing = form.watch('pricing');
  const instantBook = form.watch('instantBook');

  const save = useMutation({
    mutationFn: async ({ pricing: priceList, ...settings }: Values) => {
      await api
        .put<OwnerCar>(`/owner/cars/${car.id}/pricing`, priceList)
        .catch((error: unknown) => {
          throw underPricing(error);
        });
      return api.patch<OwnerCar>(`/owner/cars/${car.id}`, settings);
    },
    meta: { errorToast: false },
    onSuccess: (saved) => {
      setCar(saved);
      goNext();
    },
    onError: (error) => {
      applyApiError(error, form.setError, [...PRICING_FIELDS, 'depositAmount', 'bufferMinutes']);
    },
  });

  const optionalPercent = (
    name: 'weekendSurchargePercent' | 'holidaySurchargePercent' | 'longRentalDiscountPercent',
    label: string,
    hint: string,
  ) => (
    <FormField control={form.control} name={`pricing.${name}`} label={label} description={hint}>
      {(field, { id, invalid }) => (
        <NumberInput
          id={id}
          name={field.name}
          ref={field.ref}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          suffix="%"
          maxLength={3}
          placeholder="Không áp dụng"
          aria-invalid={invalid}
        />
      )}
    </FormField>
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => void form.handleSubmit((values) => save.mutate(values))(event)}
    >
      <FormError message={form.formState.errors.root?.server?.message} />

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Bảng giá</h2>
          <p className="text-sm text-muted-foreground">
            Bật ít nhất một đơn vị. Hệ thống luôn chọn cách tính rẻ nhất cho người thuê.
          </p>
        </div>
        <div className="flex flex-col divide-y rounded-lg border">
          {UNITS.map(({ key, label, suffix }) => {
            const on = pricing[key] !== null;
            return (
              <div key={key} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start">
                <label className="flex min-h-10 items-center gap-3 sm:w-40">
                  <Switch
                    checked={on}
                    onCheckedChange={(next) =>
                      form.setValue(`pricing.${key}`, next ? 0 : null, { shouldDirty: true })
                    }
                    aria-label={`Bật giá ${label.toLowerCase()}`}
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
                {on && (
                  <FormField
                    control={form.control}
                    name={`pricing.${key}`}
                    label={<span className="sr-only">Giá {label.toLowerCase()}</span>}
                    className="flex-1"
                  >
                    {(field, { id, invalid }) => (
                      <NumberInput
                        id={id}
                        name={field.name}
                        ref={field.ref}
                        value={field.value || null}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        money
                        suffix={suffix}
                        className="pr-20"
                        aria-invalid={invalid}
                      />
                    )}
                  </FormField>
                )}
              </div>
            );
          })}
        </div>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="pricing.minDurationHours"
            label="Thời gian thuê tối thiểu"
            description={pricing.hourlyPrice === null ? 'Không có giá giờ: từ 24 giờ.' : undefined}
          >
            {(field, { id, invalid }) => (
              <NumberInput
                id={id}
                name={field.name}
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                suffix="giờ"
                maxLength={4}
                aria-invalid={invalid}
              />
            )}
          </FormField>
          <FormField
            control={form.control}
            name="pricing.maxDurationDays"
            label="Thời gian thuê tối đa"
          >
            {(field, { id, invalid }) => (
              <NumberInput
                id={id}
                name={field.name}
                ref={field.ref}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                suffix="ngày"
                maxLength={3}
                aria-invalid={invalid}
              />
            )}
          </FormField>
          {optionalPercent(
            'weekendSurchargePercent',
            'Phụ phí cuối tuần',
            'Thứ Bảy, Chủ nhật. Để trống nếu không áp dụng.',
          )}
          {optionalPercent(
            'holidaySurchargePercent',
            'Phụ phí ngày lễ',
            'Để trống nếu không áp dụng.',
          )}
          {optionalPercent(
            'longRentalDiscountPercent',
            'Giảm giá thuê dài',
            'Chuyến từ 7 ngày trở lên, tối đa 50%.',
          )}
          <FormField
            control={form.control}
            name="pricing.lateFeePerHour"
            label="Phí trả trễ mỗi giờ"
            description={
              pricing.dailyPrice
                ? `Để trống: 10% giá ngày (${formatVnd(effectiveLateFeePerHour({ dailyPrice: pricing.dailyPrice, lateFeePerHour: null }))}).`
                : 'Bắt buộc khi không có giá ngày.'
            }
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
                placeholder="Mặc định"
                aria-invalid={invalid}
              />
            )}
          </FormField>
        </FieldGroup>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Cách nhận đơn</h2>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Cách nhận đơn</legend>
          {(
            [
              [true, 'Đặt nhanh', 'Người thuê thanh toán xong là chuyến được xác nhận ngay.'],
              [false, 'Duyệt tay', 'Bạn có 6 giờ để chấp nhận hoặc từ chối mỗi yêu cầu.'],
            ] as const
          ).map(([value, title, hint]) => (
            <label
              key={title}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                instantBook === value && 'border-primary bg-primary/5',
              )}
            >
              <input
                type="radio"
                name="instantBook"
                checked={instantBook === value}
                onChange={() => form.setValue('instantBook', value, { shouldDirty: true })}
                className="sr-only"
              />
              <span className="font-medium">{title}</span>
              <span className="text-sm text-muted-foreground">{hint}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="depositAmount"
          label="Tiền cọc"
          description={`Mặc định ${formatVnd(DEPOSIT_DEFAULT)}, tối đa ${formatVnd(DEPOSIT_MAX)}. Người thuê trả cùng tiền thuê.`}
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
        <FormField
          control={form.control}
          name="bufferMinutes"
          label="Thời gian đệm giữa hai chuyến"
          description="Để vệ sinh xe; lịch được giữ trống sau mỗi chuyến."
        >
          {(field, { id, invalid }) => (
            <select
              id={id}
              name={field.name}
              ref={field.ref}
              value={field.value}
              onChange={(event) => field.onChange(Number(event.target.value))}
              onBlur={field.onBlur}
              aria-invalid={invalid}
              className={selectClassName}
            >
              {BUFFER_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? 'Không cần' : formatDuration(minutes * 60_000)}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </FieldGroup>

      <StepActions onBack={goBack} pending={save.isPending} />
    </form>
  );
}
