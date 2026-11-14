'use client';

import { useQuery } from '@tanstack/react-query';
import { CarIcon } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';

import { type TripRange, TripRangePicker } from '@/components/date-time/trip-range-picker';
import { EmptyState } from '@/components/states/empty-state';
import { ErrorState } from '@/components/states/error-state';
import { LoadingState } from '@/components/states/loading-state';
import { QueryState } from '@/components/states/query-state';
import { Button } from '@/components/ui/button';
import { type ManagedPhoto, PhotoManager } from '@/components/uploads/photo-manager';
import { ApiRequestError, ClientErrorCode } from '@/lib/api/errors';
import { type BusyRange } from '@/lib/trip-time';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatTripTime,
  formatVnd,
  UploadPurpose,
  vietnamDateTime,
} from '@carenta/shared';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const DAY = 24 * 60 * 60 * 1000;

// A fixed demo clock: reading the real clock while rendering would differ between the server
// and browser renders. The picker takes `now` for the same reason in tests.
const DEMO_NOW = vietnamDateTime('2026-11-16', '10:10');
const DEMO_BUSY: BusyRange[] = [
  {
    startAt: vietnamDateTime('2026-11-19', '08:00'),
    endAt: vietnamDateTime('2026-11-19', '18:00'),
  },
  {
    startAt: vietnamDateTime('2026-11-21', '20:00'),
    endAt: vietnamDateTime('2026-11-24', '06:00'),
  },
];

function placeholderPhoto(n: number): string {
  const hue = (n * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="hsl(${hue} 70% 85%)"/><text x="200" y="170" font-size="64" text-anchor="middle" font-family="sans-serif" fill="hsl(${hue} 60% 30%)">${n}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function UiShowcase() {
  const [trip, setTrip] = useState<TripRange | null>(null);
  const [photos, setPhotos] = useState<ManagedPhoto[]>(() =>
    [1, 2, 3].map((n) => ({ id: `sample-${n}`, url: placeholderPhoto(n) })),
  );
  const counter = useRef(4);
  const [mode, setMode] = useState<'ok' | 'empty' | 'error'>('ok');
  const query = useQuery({
    queryKey: ['dev-showcase', mode],
    queryFn: async () => {
      await wait(800);
      if (mode === 'error') {
        throw new ApiRequestError(
          0,
          ClientErrorCode.NETWORK_ERROR,
          'Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng và thử lại.',
        );
      }
      return mode === 'empty' ? [] : ['Toyota Vios 2022', 'Mazda CX-5 2021'];
    },
    retry: false,
  });
  const sample = DEMO_NOW;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">Thư viện component</h1>

      <Section title="Định dạng">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">formatVnd</dt>
          <dd>{formatVnd(1_500_000)}</dd>
          <dt className="text-muted-foreground">formatDate</dt>
          <dd>{formatDate(sample)}</dd>
          <dt className="text-muted-foreground">formatDateTime</dt>
          <dd>{formatDateTime(sample)}</dd>
          <dt className="text-muted-foreground">formatTripTime</dt>
          <dd>{formatTripTime(sample)}</dd>
          <dt className="text-muted-foreground">formatDuration</dt>
          <dd>{formatDuration(2 * DAY + 3.5 * 3600_000)}</dd>
        </dl>
      </Section>

      <Section title="Chọn thời gian thuê">
        <TripRangePicker value={trip} onChange={setTrip} busy={DEMO_BUSY} now={DEMO_NOW} />
        <p className="text-xs text-muted-foreground">
          Đồng hồ mẫu: 10:10 16/11/2026. Lịch mẫu bận 08:00–18:00 ngày 19/11 và từ 20:00 ngày 21/11
          tới 06:00 ngày 24/11.
        </p>
      </Section>

      <Section title="Ảnh (tải thật lên kho lưu trữ, cần đăng nhập)">
        <PhotoManager
          photos={photos}
          purpose={UploadPurpose.AVATAR}
          max={6}
          onAdd={async () => {
            await wait(300);
            const n = counter.current++;
            setPhotos((list) => [...list, { id: `new-${n}`, url: placeholderPhoto(n) }]);
          }}
          onReorder={async (ids) => {
            await wait(300);
            setPhotos((list) =>
              ids.map((id) => list.find((p) => p.id === id)).filter((p) => p !== undefined),
            );
          }}
          onRemove={async (id) => {
            await wait(300);
            setPhotos((list) => list.filter((p) => p.id !== id));
          }}
        />
      </Section>

      <Section title="Trạng thái trang">
        <div className="flex gap-2">
          {(['ok', 'empty', 'error'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={mode === value ? 'default' : 'outline'}
              onClick={() => setMode(value)}
            >
              {value === 'ok' ? 'Có dữ liệu' : value === 'empty' ? 'Rỗng' : 'Lỗi'}
            </Button>
          ))}
        </div>
        <QueryState
          query={query}
          isEmpty={(items) => items.length === 0}
          empty={
            <EmptyState
              icon={CarIcon}
              title="Bạn chưa có xe nào"
              description="Đăng xe để bắt đầu cho thuê."
              action={<Button>Đăng xe</Button>}
            />
          }
        >
          {(items) => (
            <ul className="list-disc pl-5 text-sm">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </QueryState>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border">
            <LoadingState label="Đang tải danh sách xe…" />
          </div>
          <div className="rounded-lg border">
            <ErrorState error={new Error('raw')} onRetry={() => undefined} />
          </div>
        </div>
      </Section>
    </div>
  );
}
