'use client';

// The address search follows the ARIA combobox pattern (input + listbox of options), which
// these rules do not recognise.
/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role */

import { useMutation, useQuery } from '@tanstack/react-query';
import { LocateFixedIcon, MapPinIcon, SearchIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { z } from 'zod';

import { FormError } from '@/components/auth/form-error';
import { FormField } from '@/components/forms/form-field';
import { NumberInput } from '@/components/forms/number-input';
import { PinMapLazy } from '@/components/map/pin-map-lazy';
import { FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api/client';
import { applyApiError, useZodForm } from '@/lib/forms';
import { type GeocodedPlace, reverseGeocode, searchAddress } from '@/lib/geocoding';
import { useSetOwnerCar } from '@/lib/owner-cars';
import {
  carDeliverySchema,
  carLocationSchema,
  type CarDelivery,
  DELIVERY_RADIUS_MAX_KM,
  type OwnerCar,
} from '@carenta/shared';

import { type BasicValues } from './basic-step';
import { StepActions } from './step-actions';

const pinned = (axis: 'latitude' | 'longitude') =>
  z.number({ error: 'Vui lòng chọn vị trí xe trên bản đồ.' }).pipe(carLocationSchema.shape[axis]);

const locationFormSchema = z.object({
  location: carLocationSchema.extend({
    latitude: pinned('latitude'),
    longitude: pinned('longitude'),
  }),
  delivery: carDeliverySchema.nullable(),
});
type LocationInput = z.input<typeof locationFormSchema>;
type LocationValues = z.output<typeof locationFormSchema>;

/** Suggested when delivery is switched on; the owner changes them. */
const DELIVERY_DEFAULTS: CarDelivery = { maxRadiusKm: 10, freeRadiusKm: 0, feePerKm: 10_000 };
/** Map centre before a pin is placed: Ho Chi Minh City. */
const FALLBACK_CENTER = { latitude: 10.7769, longitude: 106.7009 };

/**
 * Step 2: where the car is picked up (spec §4.1, §4.4) and optional delivery. Before the
 * first save this step creates the draft with the details from step 1.
 */
export function LocationStep({
  car,
  basic,
  goBack,
  onSaved,
  onCreated,
}: {
  car: OwnerCar | null;
  basic: BasicValues | null;
  goBack: () => void;
  onSaved?: () => void;
  onCreated?: (car: OwnerCar) => void;
}) {
  const setCar = useSetOwnerCar();
  const form = useZodForm<LocationInput, LocationValues>(locationFormSchema, {
    defaultValues: {
      location: car?.location ?? { province: '', ward: '', addressLine: '' },
      delivery: car?.delivery ?? null,
    },
  });
  const position = form.watch(['location.latitude', 'location.longitude']);
  const delivery = form.watch('delivery');
  const latLng =
    typeof position[0] === 'number' && typeof position[1] === 'number'
      ? { latitude: position[0], longitude: position[1] }
      : null;

  const applyPlace = (place: GeocodedPlace, keepPin = false) => {
    const opts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted };
    if (!keepPin) {
      form.setValue('location.latitude', place.latitude, opts);
      form.setValue('location.longitude', place.longitude, opts);
    }
    if (place.province) form.setValue('location.province', place.province, opts);
    if (place.ward) form.setValue('location.ward', place.ward, opts);
    if (place.addressLine) form.setValue('location.addressLine', place.addressLine, opts);
  };

  const movePin = (next: { latitude: number; longitude: number }) => {
    const opts = { shouldDirty: true, shouldValidate: form.formState.isSubmitted };
    form.setValue('location.latitude', next.latitude, opts);
    form.setValue('location.longitude', next.longitude, opts);
    // Fill the address fields from the new point; the owner can still edit them.
    reverseGeocode(next.latitude, next.longitude).then(
      (place) => place && applyPlace(place, true),
      () => undefined,
    );
  };

  const save = useMutation({
    mutationFn: (values: LocationValues) =>
      car
        ? api.patch<OwnerCar>(`/owner/cars/${car.id}`, values)
        : api.post<OwnerCar>('/owner/cars', { ...basic, ...values }),
    meta: { errorToast: false },
    onSuccess: (saved) => {
      setCar(saved);
      if (car) onSaved?.();
      else onCreated?.(saved);
    },
    onError: (error) => {
      applyApiError(
        error,
        form.setError,
        [
          'location.province',
          'location.ward',
          'location.addressLine',
          'location.latitude',
          'delivery.maxRadiusKm',
          'delivery.freeRadiusKm',
          'delivery.feePerKm',
        ],
        // Problems with step 1 fields (plate taken, model gone) show above the form.
      );
    },
  });

  const latitudeError = form.formState.errors.location?.latitude;

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => void form.handleSubmit((values) => save.mutate(values))(event)}
    >
      <FieldGroup>
        <FormError message={form.formState.errors.root?.server?.message} />
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Vị trí nhận xe</h2>
          <p className="text-sm text-muted-foreground">
            Người thuê chỉ thấy phường/xã và vị trí gần đúng cho tới khi chuyến được xác nhận.
          </p>
        </div>
        <AddressSearch onPick={(place) => applyPlace(place)} />
        <div className="flex flex-col gap-2">
          <PinMapLazy position={latLng} fallbackCenter={FALLBACK_CENTER} onChange={movePin} />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPinIcon className="size-3.5" aria-hidden />
            Chạm vào bản đồ hoặc kéo ghim để chỉnh vị trí chính xác.
          </p>
          <FieldError errors={[latitudeError]} />
          <UseMyLocation onLocate={movePin} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField control={form.control} name="location.province" label="Tỉnh/thành phố">
            {(field, { id, invalid }) => (
              <Input {...field} id={id} aria-invalid={invalid} className="h-10" />
            )}
          </FormField>
          <FormField control={form.control} name="location.ward" label="Phường/xã">
            {(field, { id, invalid }) => (
              <Input {...field} id={id} aria-invalid={invalid} className="h-10" />
            )}
          </FormField>
          <FormField
            control={form.control}
            name="location.addressLine"
            label="Số nhà, đường"
            className="sm:col-span-2"
          >
            {(field, { id, invalid }) => (
              <Input
                {...field}
                id={id}
                autoComplete="street-address"
                aria-invalid={invalid}
                className="h-10"
              />
            )}
          </FormField>
        </div>
      </FieldGroup>

      <FieldGroup className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-4">
          <span className="flex flex-col gap-1">
            <span className="font-semibold">Giao xe tận nơi</span>
            <span className="text-sm text-muted-foreground">
              Người thuê luôn nhận được xe tại vị trí trên. Bật để giao thêm tới địa chỉ của họ.
            </span>
          </span>
          <Switch
            checked={delivery !== null}
            onCheckedChange={(on) =>
              form.setValue('delivery', on ? DELIVERY_DEFAULTS : null, { shouldDirty: true })
            }
            aria-label="Giao xe tận nơi"
          />
        </div>
        {delivery !== null && (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="delivery.maxRadiusKm"
              label="Bán kính giao tối đa"
            >
              {(field, { id, invalid }) => (
                <NumberInput
                  id={id}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  suffix="km"
                  maxLength={3}
                  aria-invalid={invalid}
                />
              )}
            </FormField>
            <FormField control={form.control} name="delivery.freeRadiusKm" label="Miễn phí trong">
              {(field, { id, invalid }) => (
                <NumberInput
                  id={id}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  suffix="km"
                  maxLength={3}
                  aria-invalid={invalid}
                />
              )}
            </FormField>
            <FormField control={form.control} name="delivery.feePerKm" label="Phí mỗi km tiếp theo">
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
            <p className="text-xs text-muted-foreground sm:col-span-3">
              Khoảng cách tính theo đường chim bay, tối đa {DELIVERY_RADIUS_MAX_KM} km.
            </p>
          </div>
        )}
      </FieldGroup>

      <StepActions
        onBack={goBack}
        pending={save.isPending}
        submitLabel={car ? 'Lưu và tiếp tục' : 'Lưu bản nháp và tiếp tục'}
      />
    </form>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Address suggestions from Nominatim, waiting for a pause in typing (≈1 request/second). */
function AddressSearch({ onPick }: { onPick: (place: GeocodedPlace) => void }) {
  const listId = useId();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const query = useDebounced(text.trim(), 700);
  const results = useQuery({
    queryKey: ['geocode', query],
    queryFn: ({ signal }) => searchAddress(query, signal),
    enabled: query.length >= 3,
    staleTime: Infinity,
    retry: false,
    meta: { errorToast: false },
  });
  const places = results.data ?? [];

  return (
    <div className="relative flex flex-col gap-2">
      <label htmlFor="address-search" className="text-sm font-medium">
        Tìm địa chỉ
      </label>
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="address-search"
          type="search"
          role="combobox"
          aria-expanded={open && places.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Ví dụ: 12 Nguyễn Huệ, Sài Gòn"
          className="h-10 pl-9"
        />
      </div>
      {open && query.length >= 3 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        >
          {results.isFetching && places.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">Đang tìm…</li>
          )}
          {results.isError && (
            <li className="px-3 py-2 text-muted-foreground">
              Không tìm được địa chỉ lúc này. Hãy chọn vị trí trên bản đồ.
            </li>
          )}
          {results.isSuccess && places.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">
              Không thấy địa chỉ phù hợp. Hãy thử cách viết khác hoặc chọn trên bản đồ.
            </li>
          )}
          {places.map((place) => (
            <li key={`${place.latitude},${place.longitude}`} role="option" aria-selected={false}>
              <button
                type="button"
                // mousedown fires before the input blurs and closes the list.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(place);
                  setText(place.label);
                  setOpen(false);
                }}
                className="w-full rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UseMyLocation({
  onLocate,
}: {
  onLocate: (position: { latitude: number; longitude: number }) => void;
}) {
  const [state, setState] = useState<'idle' | 'locating' | 'failed'>('idle');
  if (typeof navigator !== 'undefined' && !('geolocation' in navigator)) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        type="button"
        disabled={state === 'locating'}
        onClick={() => {
          setState('locating');
          navigator.geolocation.getCurrentPosition(
            (result) => {
              setState('idle');
              onLocate({ latitude: result.coords.latitude, longitude: result.coords.longitude });
            },
            () => setState('failed'),
            { enableHighAccuracy: true, timeout: 10_000 },
          );
        }}
        className="inline-flex items-center gap-1.5 text-primary hover:underline disabled:opacity-50"
      >
        <LocateFixedIcon className="size-4" aria-hidden />
        {state === 'locating' ? 'Đang lấy vị trí…' : 'Dùng vị trí hiện tại'}
      </button>
      {state === 'failed' && (
        <span className="text-muted-foreground">
          Không lấy được vị trí. Hãy cho phép truy cập vị trí.
        </span>
      )}
    </div>
  );
}
