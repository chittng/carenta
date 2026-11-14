'use client';

import { useQuery } from '@tanstack/react-query';
import { CarFrontIcon, ListIcon, MapIcon, SlidersHorizontalIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { CarCard } from '@/components/cars/car-card';
import { selectClassName } from '@/components/forms/form-field';
import { EmptyState } from '@/components/states/empty-state';
import { QueryState } from '@/components/states/query-state';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { api } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { searchAround, searchHref, searchInput, type SearchView } from '@/lib/car-search';
import { routes } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { type CarSearchPage, type CarSearchQuery, carSearchQuerySchema } from '@carenta/shared';

import { SearchBar, SearchFilters } from './search-forms';

const SearchMap = dynamic(() => import('./search-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-[60dvh] min-h-96 w-full rounded-xl" />,
});

const SORT_LABELS = {
  newest: 'Mới nhất',
  price_asc: 'Giá thấp đến cao',
  price_desc: 'Giá cao đến thấp',
  rating: 'Đánh giá cao nhất',
  distance: 'Gần nhất',
} as const;

const NO_CARS: CarSearchPage['items'] = [];

export function CarSearch() {
  const params = useSearchParams();
  const parsed = carSearchQuerySchema.safeParse(
    searchInput(new URLSearchParams(params.toString())),
  );
  const view = params.get('view') === 'map' ? 'map' : 'list';
  return (
    <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <p className="mb-2 text-sm font-medium text-primary">Tự do trên mọi hành trình</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Tìm chiếc xe cho chuyến đi của bạn
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Chọn nơi nhận xe, thời gian và chiếc xe phù hợp với bạn.
        </p>
      </div>
      {parsed.success ? (
        <SearchExperience query={parsed.data} view={view} urlKey={params.toString()} />
      ) : (
        <EmptyState
          icon={SlidersHorizontalIcon}
          title="Liên kết tìm kiếm không hợp lệ"
          description="Địa điểm, thời gian hoặc bộ lọc trong liên kết không còn phù hợp. Hãy chọn lại để tìm xe."
          action={
            <Link href={routes.search} className={cn(buttonVariants())}>
              Chọn lại tìm kiếm
            </Link>
          }
        />
      )}
    </div>
  );
}

function SearchExperience({
  query,
  view,
  urlKey,
}: {
  query: CarSearchQuery;
  view: SearchView;
  urlKey: string;
}) {
  const router = useRouter();
  const mobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const results = useQuery({
    queryKey: ['cars', 'search', query],
    queryFn: ({ signal }) => api.get<CarSearchPage>('/cars', query, { signal }),
    staleTime: 30_000,
  });

  function apply(value: CarSearchQuery) {
    router.push(searchHref(value, view), { scroll: false });
    setFiltersOpen(false);
  }
  function clearFilters() {
    apply({
      province: query.province,
      ward: query.ward,
      lat: query.lat,
      lng: query.lng,
      radiusKm: query.radiusKm,
      startAt: query.startAt,
      endAt: query.endAt,
      page: 1,
      pageSize: query.pageSize,
    });
  }
  const filterForm = (
    <SearchFilters key={urlKey} query={query} onApply={apply} onClear={clearFilters} />
  );
  const pages = results.data
    ? Math.max(1, Math.ceil(results.data.total / results.data.pageSize))
    : 1;
  return (
    <>
      <SearchBar key={urlKey} query={query} onApply={apply} />
      <div className="grid items-start gap-6 md:grid-cols-[15rem_minmax(0,1fr)]">
        {!mobile && (
          <aside
            aria-label="Bộ lọc tìm xe"
            className="hidden max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border p-4 md:sticky md:top-4 md:block"
          >
            <h2 className="mb-5 flex items-center gap-2 font-semibold">
              <SlidersHorizontalIcon className="size-4" aria-hidden />
              Bộ lọc
            </h2>
            {filterForm}
          </aside>
        )}
        <section
          aria-label="Kết quả tìm xe"
          className="min-w-0 space-y-4"
          aria-busy={results.isFetching}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" aria-live="polite">
              {results.data ? (
                <>
                  <strong>{results.data.total}</strong> xe phù hợp
                  {results.isFetching && (
                    <span className="text-muted-foreground"> · Đang cập nhật…</span>
                  )}
                </>
              ) : (
                'Khám phá xe trên Carenta'
              )}
            </p>
            <div className="flex items-center gap-2">
              {mobile && (
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}>
                    <SlidersHorizontalIcon aria-hidden />
                    Bộ lọc
                  </SheetTrigger>
                  <SheetContent
                    side="bottom"
                    className="max-h-[92dvh] gap-0 overflow-hidden rounded-t-2xl"
                  >
                    <SheetHeader className="shrink-0">
                      <SheetTitle>Bộ lọc tìm xe</SheetTitle>
                      <SheetDescription>Chọn các tiêu chí rồi nhấn Áp dụng.</SheetDescription>
                    </SheetHeader>
                    <div className="min-h-0 overflow-y-auto px-4">{filterForm}</div>
                  </SheetContent>
                </Sheet>
              )}
              <div className="flex rounded-lg border p-0.5" aria-label="Chế độ xem">
                <Link
                  href={searchHref(query, 'list')}
                  scroll={false}
                  aria-current={view === 'list' ? 'page' : undefined}
                  aria-label="Xem danh sách"
                  className={cn(
                    buttonVariants({ variant: view === 'list' ? 'secondary' : 'ghost' }),
                    'h-9 px-3',
                  )}
                >
                  <ListIcon aria-hidden />
                  <span className="hidden lg:inline">Danh sách</span>
                </Link>
                <Link
                  href={searchHref(query, 'map')}
                  scroll={false}
                  aria-current={view === 'map' ? 'page' : undefined}
                  aria-label="Xem bản đồ"
                  className={cn(
                    buttonVariants({ variant: view === 'map' ? 'secondary' : 'ghost' }),
                    'h-9 px-3',
                  )}
                >
                  <MapIcon aria-hidden />
                  <span className="hidden lg:inline">Bản đồ</span>
                </Link>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="search-sort" className="shrink-0 text-sm text-muted-foreground">
              Sắp xếp
            </label>
            <select
              id="search-sort"
              className={cn(selectClassName, 'max-w-60')}
              value={query.sort ?? (query.lat !== undefined ? 'distance' : 'newest')}
              onChange={(event) => {
                const sort = carSearchQuerySchema.shape.sort.safeParse(event.target.value);
                if (sort.success) apply({ ...query, sort: sort.data, page: 1 });
              }}
            >
              {Object.entries(SORT_LABELS)
                .filter(([key]) => key !== 'distance' || query.lat !== undefined)
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
          {view === 'map' && (
            <>
              <SearchMap
                cars={results.data?.items ?? NO_CARS}
                query={query}
                onSearch={(center) => {
                  const next = searchAround(query, center);
                  if (next) apply(next);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Bản đồ hiển thị xe của trang kết quả hiện tại. Vòng tròn là vị trí gần đúng; địa chỉ
                chính xác được cung cấp sau khi chuyến được xác nhận.
              </p>
            </>
          )}
          <QueryState
            query={results}
            loading={<SearchSkeleton />}
            empty={
              <EmptyState
                icon={CarFrontIcon}
                title="Chưa tìm thấy xe phù hợp"
                description="Thử địa điểm khác, đổi thời gian hoặc bớt bộ lọc để có thêm lựa chọn."
                action={
                  <Button variant="outline" className="h-10" onClick={clearFilters}>
                    Xoá bộ lọc
                  </Button>
                }
              />
            }
            isEmpty={(page) => page.total === 0}
            errorTitle="Không tải được kết quả tìm xe"
          >
            {(page) => (
              <>
                {page.items.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {page.items.map((car) => (
                      <CarCard key={car.id} car={car} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Trang này không có xe"
                    action={
                      <Link
                        href={searchHref({ ...query, page: 1 }, view)}
                        className={cn(buttonVariants({ variant: 'outline' }))}
                      >
                        Về trang đầu
                      </Link>
                    }
                  />
                )}
                <nav
                  aria-label="Phân trang kết quả"
                  className="flex flex-wrap items-center justify-center gap-3 pt-2"
                >
                  {query.page > 1 && (
                    <Link
                      href={searchHref({ ...query, page: query.page - 1 }, view)}
                      scroll={false}
                      className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}
                    >
                      Trang trước
                    </Link>
                  )}
                  <span className="text-sm text-muted-foreground">
                    Trang {page.page} / {pages}
                  </span>
                  {query.page < pages && (
                    <Link
                      href={searchHref({ ...query, page: query.page + 1 }, view)}
                      scroll={false}
                      className={cn(buttonVariants({ variant: 'outline' }), 'h-10')}
                    >
                      Trang sau
                    </Link>
                  )}
                </nav>
              </>
            )}
          </QueryState>
          {results.error instanceof ApiRequestError && results.error.details.length > 0 && (
            <ul className="space-y-1 text-sm text-destructive" role="alert">
              {results.error.details.map((detail) => (
                <li key={detail.path}>{detail.message}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function SearchSkeleton() {
  return (
    <output aria-label="Đang tìm xe" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border p-3">
          <Skeleton className="aspect-[16/10] w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      ))}
    </output>
  );
}
