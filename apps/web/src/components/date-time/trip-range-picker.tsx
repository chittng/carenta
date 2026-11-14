'use client';

import { CalendarRangeIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { type DateRange } from 'react-day-picker';
import { vi } from 'react-day-picker/locale';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  type BusyRange,
  isUnavailableDay,
  overlapsBusy,
  pickupSlots,
  returnSlots,
  tripIssue,
} from '@/lib/trip-time';
import { cn } from '@/lib/utils';
import {
  formatDuration,
  formatTripTime,
  vietnamDate,
  vietnamDateTime,
  vietnamTime,
} from '@carenta/shared';

export interface TripRange {
  startAt: Date;
  endAt: Date;
}

export interface TripRangePickerProps {
  value: TripRange | null;
  onChange: (value: TripRange | null) => void;
  /** The car's busy ranges for the months on screen; empty when not tied to a car. */
  busy?: readonly BusyRange[];
  /** Months on screen (`YYYY-MM`), so the caller can load their busy ranges. */
  onMonthsChange?: (months: string[]) => void;
  /** Fixed clock for tests and screenshots. */
  now?: Date;
  className?: string;
}

const PREFERRED_TIME = '09:00';
const NO_BUSY_RANGES: readonly BusyRange[] = [];

// Calendar days are wall-clock dates read as Vietnam dates; local Date getters only carry
// the year, month and day, so the visitor's own time zone never shifts a day.
function ymd(day: Date): string {
  const mm = String(day.getMonth() + 1).padStart(2, '0');
  const dd = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${mm}-${dd}`;
}

function calendarDay(date: string): Date {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function monthsFrom(first: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    ymd(new Date(first.getFullYear(), first.getMonth() + i, 1)).slice(0, 7),
  );
}

/** The chosen time if still free, else the first free slot from 09:00 on, else the first. */
function pick(slots: string[], preferred: string | undefined): string | undefined {
  if (preferred && slots.includes(preferred)) return preferred;
  return slots.find((slot) => slot >= PREFERRED_TIME) ?? slots[0];
}

/**
 * Pickup and return picker (spec §5.1, §5.3): a date range on the calendar plus a time for
 * each end, on the 30-minute grid, all in Vietnam time. Past days, days beyond the booking
 * window and fully busy days are disabled; busy times are left out of the time lists.
 */
export function TripRangePicker({
  value,
  onChange,
  busy = NO_BUSY_RANGES,
  onMonthsChange,
  now: fixedNow,
  className,
}: TripRangePickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const label = value ? (
    <span className="grid w-full grid-cols-2 gap-3 text-left">
      <TripEnd title="Nhận xe" instant={value.startAt} />
      <TripEnd title="Trả xe" instant={value.endAt} />
    </span>
  ) : (
    <span className="flex items-center gap-2 text-muted-foreground">
      <CalendarRangeIcon className="size-4" aria-hidden />
      Chọn giờ nhận và trả xe
    </span>
  );

  const triggerClass = cn(
    'flex min-h-11 w-full items-center rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
    className,
  );
  const panel = (
    <TripRangePanel
      // Re-mount on open so the draft starts from the current value.
      key={String(open)}
      value={value}
      busy={busy}
      now={fixedNow}
      months={isMobile ? 1 : 2}
      onMonthsChange={onMonthsChange}
      onApply={(range) => {
        onChange(range);
        setOpen(false);
      }}
      onClear={() => {
        onChange(null);
        setOpen(false);
      }}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className={triggerClass}>{label}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Thời gian thuê</SheetTitle>
            <SheetDescription>Giờ Việt Nam, theo bước 30 phút.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{panel}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClass}>{label}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        {panel}
      </PopoverContent>
    </Popover>
  );
}

function TripEnd({ title, instant }: { title: string; instant: Date }) {
  // Time and date on separate lines so both fit side by side at 375px.
  const [time, date] = formatTripTime(instant).split(/ (.*)/s);
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-xs text-muted-foreground">{title}</span>
      <span className="font-semibold">{time}</span>
      <span className="text-xs">{date}</span>
    </span>
  );
}

function TripRangePanel({
  value,
  busy,
  now: fixedNow,
  months,
  onMonthsChange,
  onApply,
  onClear,
}: {
  value: TripRange | null;
  busy: readonly BusyRange[];
  now?: Date;
  months: number;
  onMonthsChange?: (months: string[]) => void;
  onApply: (range: TripRange) => void;
  onClear: () => void;
}) {
  const startId = useId();
  const endId = useId();
  // Read the clock once per opening: slots should not shift while the renter is choosing.
  const [now] = useState(() => fixedNow ?? new Date());
  const [range, setRange] = useState<DateRange | undefined>(
    value
      ? { from: calendarDay(vietnamDate(value.startAt)), to: calendarDay(vietnamDate(value.endAt)) }
      : undefined,
  );
  const [startTime, setStartTime] = useState(value ? vietnamTime(value.startAt) : undefined);
  const [endTime, setEndTime] = useState(value ? vietnamTime(value.endAt) : undefined);

  const fromDate = range?.from ? ymd(range.from) : undefined;
  const toDate = range?.to ? ymd(range.to) : undefined;

  const startOptions = fromDate ? pickupSlots(fromDate, busy, now) : [];
  const start = fromDate ? pick(startOptions, startTime) : undefined;
  const startAt = fromDate && start ? vietnamDateTime(fromDate, start) : undefined;
  const endOptions = toDate && startAt ? returnSlots(toDate, startAt, busy) : [];
  const end = toDate ? pick(endOptions, endTime ?? start) : undefined;
  const endAt = toDate && end ? vietnamDateTime(toDate, end) : undefined;

  const issue = (() => {
    if (!fromDate || !toDate) return null;
    if (!start) return 'Ngày nhận xe không còn giờ trống.';
    if (!startAt) return 'Ngày nhận xe không còn giờ trống.';
    if (!end || !endAt) {
      // No return slot left: either the calendar is busy in between, or the trip is too long.
      return overlapsBusy(startAt, vietnamDateTime(toDate, '23:30'), busy)
        ? 'Xe đã có lịch trong khoảng thời gian này. Vui lòng chọn ngày khác.'
        : 'Ngày trả xe không còn giờ phù hợp với giờ nhận.';
    }
    return tripIssue(startAt, endAt, busy, now);
  })();

  const firstMonth = range?.from ?? calendarDay(vietnamDate(now));

  return (
    <div className="flex flex-col gap-3">
      <Calendar
        mode="range"
        locale={vi}
        numberOfMonths={months}
        defaultMonth={firstMonth}
        startMonth={calendarDay(vietnamDate(now))}
        today={calendarDay(vietnamDate(now))}
        selected={range}
        onSelect={setRange}
        // A range may not run across a day that is busy from start to end.
        excludeDisabled
        disabled={(day) => isUnavailableDay(ymd(day), busy, now)}
        onMonthChange={(month) => onMonthsChange?.(monthsFrom(month, months))}
        className="mx-auto p-0 [--cell-size:--spacing(10)] md:[--cell-size:--spacing(9)]"
      />

      <div className="grid grid-cols-2 gap-3">
        <TimeSelect
          id={startId}
          label="Giờ nhận xe"
          value={start}
          options={startOptions}
          disabled={!fromDate}
          onChange={setStartTime}
        />
        <TimeSelect
          id={endId}
          label="Giờ trả xe"
          value={end}
          options={endOptions}
          disabled={!toDate}
          onChange={setEndTime}
        />
      </div>

      <p
        className={cn('min-h-5 text-sm', issue ? 'text-destructive' : 'text-muted-foreground')}
        aria-live="polite"
      >
        {issue ??
          (startAt && endAt
            ? `Thời gian thuê: ${formatDuration(endAt.getTime() - startAt.getTime())}`
            : 'Chọn ngày nhận xe rồi ngày trả xe trên lịch.')}
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClear}>
          Xoá
        </Button>
        <Button
          type="button"
          disabled={!startAt || !endAt || issue !== null}
          onClick={() => startAt && endAt && onApply({ startAt, endAt })}
        >
          Áp dụng
        </Button>
      </div>
    </div>
  );
}

function TimeSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {/* Native select: phones show their own wheel picker, which suits 48 options best. */}
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled || options.length === 0}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.length === 0 && <option value="">--:--</option>}
        {options.map((slot) => (
          <option key={slot} value={slot}>
            {slot}
          </option>
        ))}
      </select>
    </div>
  );
}
