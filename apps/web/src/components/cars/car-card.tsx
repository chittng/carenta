'use client';

import { CarFrontIcon, MapPinIcon, StarIcon, UsersIcon, ZapIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { carDetailPath } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import {
  type CarSearchResult,
  formatDuration,
  formatVnd,
  TRANSMISSION_LABELS,
} from '@carenta/shared';

/** Shared by the result grid and map popups. All location data comes from the public API. */
export function CarCard({ car, compact = false }: { car: CarSearchResult; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const name = `${car.make.name} ${car.model.name} ${car.year}`;
  return (
    <Link
      href={carDetailPath(car.id)}
      className={cn(
        'group block min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring',
        compact && 'w-64',
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {car.coverPhoto && !failed ? (
          <Image
            src={car.coverPhoto.sm}
            alt={name}
            fill
            unoptimized
            sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <CarFrontIcon className="size-14" aria-hidden />
            <span className="sr-only">Chưa có ảnh xe</span>
          </div>
        )}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {car.instantBook && (
            <Badge className="bg-background text-primary">
              <ZapIcon aria-hidden />
              Đặt nhanh
            </Badge>
          )}
          {car.deliveryAvailable && <Badge variant="secondary">Giao tận nơi</Badge>}
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-base leading-snug font-semibold group-hover:text-primary">{name}</h3>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="size-3.5" aria-hidden />
              {car.seats} chỗ
            </span>
            <span>{TRANSMISSION_LABELS[car.transmission]}</span>
          </p>
        </div>
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <MapPinIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {[car.location.ward, car.location.province].filter(Boolean).join(', ')}
            {car.distanceKm !== null &&
              ` · Cách khoảng ${new Intl.NumberFormat('vi-VN').format(car.distanceKm)} km`}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {car.rating.average !== null ? (
            <span className="inline-flex items-center gap-1 font-medium">
              <StarIcon className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
              {new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(
                car.rating.average,
              )}{' '}
              ({car.rating.count})
            </span>
          ) : (
            <span className="text-muted-foreground">Chưa có đánh giá</span>
          )}
          <span className="text-muted-foreground">· {car.tripCount} chuyến</span>
        </div>
        <div className="border-t pt-3">
          <p>
            <strong className="text-lg text-primary">
              {formatVnd(car.prices.dailyEquivalentPrice)}
            </strong>
            <span className="text-xs text-muted-foreground">
              {' '}
              / ngày{car.prices.dailyPrice === null ? ' quy đổi' : ''}
            </span>
          </p>
          {car.estimate && (
            <p className="mt-1 text-xs text-muted-foreground">
              Ước tính {formatVnd(car.estimate.rentalAmount)} /{' '}
              {formatDuration(car.estimate.durationMinutes * 60_000)}
              <span className="mt-1 block">Chưa gồm phí giao xe và tiền cọc.</span>
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
