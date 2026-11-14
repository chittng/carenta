'use client';

import { useMutation } from '@tanstack/react-query';
import { CircleCheckIcon, CircleIcon, ClockIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Section } from '@/components/account/section';
import { FormError } from '@/components/auth/form-error';
import { EmptyState } from '@/components/states/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { ApiRequestError, errorMessage } from '@/lib/api/errors';
import { routes } from '@/lib/navigation';
import { useSetOwnerCar } from '@/lib/owner-cars';
import { cn } from '@/lib/utils';
import {
  BODY_TYPE_LABELS,
  CAR_PHOTO_MAX,
  CAR_PHOTO_MIN,
  CAR_STATUS_LABELS,
  CarDocumentType,
  ErrorCode,
  formatVnd,
  FUEL_TYPE_LABELS,
  type OwnerCar,
  TRANSMISSION_LABELS,
  vietnamDate,
} from '@carenta/shared';

import { type StepProps, type WizardStep } from './car-wizard';
import { StepActions } from './step-actions';

interface Check {
  label: string;
  done: boolean;
  step: WizardStep;
}

/** What `submit` requires (spec §4.1), checked here so the owner sees it before sending. */
function checklist(car: OwnerCar): Check[] {
  const today = vietnamDate();
  const inspection = car.documents.find((d) => d.type === CarDocumentType.INSPECTION);
  return [
    {
      label: `Từ ${CAR_PHOTO_MIN} đến ${CAR_PHOTO_MAX} ảnh (đang có ${car.photos.length})`,
      done: car.photos.length >= CAR_PHOTO_MIN && car.photos.length <= CAR_PHOTO_MAX,
      step: 'anh',
    },
    { label: 'Bảng giá', done: car.pricing !== null, step: 'gia' },
    {
      label: 'Giấy đăng ký xe',
      done: car.documents.some((d) => d.type === CarDocumentType.REGISTRATION),
      step: 'giay-to',
    },
    {
      label: 'Giấy đăng kiểm còn hạn',
      done: inspection !== undefined && (inspection.expiresOn ?? '') >= today,
      step: 'giay-to',
    },
  ];
}

/** Step 7: summary, what is still missing, and sending the car for review. */
export function ReviewStep({ car, goBack, goTo }: StepProps) {
  const setCar = useSetOwnerCar();
  const [problems, setProblems] = useState<string[]>([]);
  const checks = checklist(car);
  const ready = checks.every((check) => check.done);

  const submit = useMutation({
    mutationFn: () => api.post<OwnerCar>(`/owner/cars/${car.id}/submit`),
    meta: { errorToast: false },
    onSuccess: (saved) => {
      setProblems([]);
      setCar(saved);
    },
    onError: (error) => {
      // CAR_INCOMPLETE lists each missing piece in `details`.
      setProblems(
        error instanceof ApiRequestError && error.code === ErrorCode.CAR_INCOMPLETE
          ? error.details.map((detail) => detail.message)
          : [errorMessage(error)],
      );
    },
  });

  if (car.status === 'PENDING_REVIEW' || car.status === 'ACTIVE' || car.status === 'PAUSED') {
    return (
      <EmptyState
        icon={car.status === 'PENDING_REVIEW' ? ClockIcon : CircleCheckIcon}
        title={car.status === 'PENDING_REVIEW' ? 'Đã gửi duyệt' : CAR_STATUS_LABELS[car.status]}
        description={
          car.status === 'PENDING_REVIEW'
            ? 'Quản trị viên sẽ kiểm tra thông tin và giấy tờ. Kết quả được gửi qua email.'
            : 'Xe đã được duyệt. Sửa thông tin xe ở trang quản lý xe.'
        }
        // The car list (/xe-cua-toi) arrives with CARENTA-19.
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href={routes.home}
              className={cn(buttonVariants({ size: 'lg', variant: 'outline' }))}
            >
              Về trang chủ
            </Link>
            <Link href={routes.newCar} className={cn(buttonVariants({ size: 'lg' }))}>
              Đăng thêm xe
            </Link>
          </div>
        }
      />
    );
  }

  const rows: [string, string][] = [
    ['Xe', `${car.make.name} ${car.model.name} ${car.year}`],
    ['Biển số', car.licensePlate],
    [
      'Thông số',
      `${BODY_TYPE_LABELS[car.bodyType]} · ${car.seats} chỗ · ${TRANSMISSION_LABELS[car.transmission]} · ${FUEL_TYPE_LABELS[car.fuelType]}`,
    ],
    ['Địa chỉ', `${car.location.addressLine}, ${car.location.ward}, ${car.location.province}`],
    ['Giao xe', car.delivery ? `Trong ${car.delivery.maxRadiusKm} km` : 'Chỉ nhận tại chỗ'],
    [
      'Giá',
      car.pricing
        ? [
            car.pricing.hourlyPrice && `${formatVnd(car.pricing.hourlyPrice)}/giờ`,
            car.pricing.dailyPrice && `${formatVnd(car.pricing.dailyPrice)}/ngày`,
            car.pricing.monthlyPrice && `${formatVnd(car.pricing.monthlyPrice)}/tháng`,
          ]
            .filter(Boolean)
            .join(' · ')
        : 'Chưa có',
    ],
    ['Cách nhận đơn', car.instantBook ? 'Đặt nhanh' : 'Duyệt tay'],
    ['Tiền cọc', formatVnd(car.depositAmount)],
    [
      'Tiện nghi',
      car.amenities.length > 0 ? car.amenities.map((a) => a.name).join(', ') : 'Chưa chọn',
    ],
  ];

  return (
    <div className="flex flex-col gap-4">
      {car.status === 'REJECTED' && car.rejectionReason && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Lần trước xe bị từ chối: {car.rejectionReason}. Sửa lại rồi gửi duyệt lần nữa.
        </p>
      )}
      <Section title="Kiểm tra trước khi gửi">
        <ul className="flex flex-col gap-2">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2">
                {check.done ? (
                  <CircleCheckIcon
                    className="size-4 text-success-foreground"
                    aria-label="Đã xong"
                  />
                ) : (
                  <CircleIcon className="size-4 text-muted-foreground" aria-label="Chưa xong" />
                )}
                {check.label}
              </span>
              {!check.done && (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => goTo(check.step)}
                >
                  Bổ sung
                </button>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Thông tin xe">
        {car.photos[0] && (
          // oxlint-disable-next-line nextjs/no-img-element -- public storage URL, already sized
          <img
            src={car.photos[0].urls.lg}
            alt="Ảnh bìa"
            className="aspect-video w-full rounded-lg object-cover"
          />
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {problems.length > 0 && <FormError message={problems.join(' ')} />}
      <StepActions
        onBack={goBack}
        onNext={() => submit.mutate()}
        pending={submit.isPending}
        submitLabel={ready ? 'Gửi duyệt' : 'Gửi duyệt (còn thiếu)'}
      />
    </div>
  );
}
