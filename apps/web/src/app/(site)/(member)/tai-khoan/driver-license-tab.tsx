'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClockIcon,
  IdCardIcon,
  MailWarningIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Section } from '@/components/account/section';
import { FormError } from '@/components/auth/form-error';
import { EmptyState } from '@/components/states/empty-state';
import { LoadingState } from '@/components/states/loading-state';
import { QueryState } from '@/components/states/query-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ImagePicker } from '@/components/uploads/image-picker';
import { DRIVER_LICENSES_QUERY_KEY, PROFILE_QUERY_KEY, useMyDriverLicenses } from '@/lib/account';
import { api } from '@/lib/api/client';
import { applyApiError, useZodForm } from '@/lib/forms';
import { useResendVerification, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  addDays,
  DRIVER_LICENSE_CLASS_LABELS,
  DRIVER_LICENSE_EXPIRY_REMINDER_DAYS,
  type DriverLicense,
  DriverLicenseClass,
  DriverLicenseStatus,
  ErrorCode,
  formatDateTime,
  formatIsoDate,
  type MyDriverLicenses,
  submitDriverLicenseSchema,
  UploadPurpose,
  vietnamDate,
} from '@carenta/shared';

/**
 * GPLX tab (spec §3): the license in use for renting (approved or expired), a newer
 * submission (pending or rejected), and the form to submit or resubmit at any time.
 */
export function DriverLicenseTab() {
  const licenses = useMyDriverLicenses();
  return <QueryState query={licenses}>{(data) => <DriverLicenses licenses={data} />}</QueryState>;
}

function DriverLicenses({ licenses }: { licenses: MyDriverLicenses }) {
  const { current, submission } = licenses;
  // Open by default when there is nothing usable and nothing waiting for review.
  const needsForm =
    submission?.status !== DriverLicenseStatus.PENDING &&
    (current === null || current.status === DriverLicenseStatus.EXPIRED);
  const [formOpen, setFormOpen] = useState(needsForm);
  const showForm = formOpen || needsForm;
  const base = submission ?? current;

  return (
    <div className="flex flex-col gap-4">
      {current === null && submission === null && (
        <Section title="Giấy phép lái xe">
          <EmptyState
            icon={IdCardIcon}
            title="Bạn chưa nộp GPLX"
            description="Bạn vẫn xem và tìm xe bình thường. Cần GPLX được duyệt khi đặt xe."
            className="p-0"
          />
        </Section>
      )}
      {submission && (
        <LicenseCard
          license={submission}
          title={current ? 'GPLX mới đã nộp' : 'GPLX đã nộp'}
          note={
            submission.status === DriverLicenseStatus.PENDING && current?.status === 'APPROVED'
              ? 'GPLX đang dùng vẫn được dùng để thuê xe cho tới khi bản mới được duyệt.'
              : undefined
          }
        />
      )}
      {current && <LicenseCard license={current} title="GPLX đang dùng" />}

      {showForm ? (
        <SubmitForm
          base={base}
          onDone={() => setFormOpen(false)}
          onCancel={needsForm ? undefined : () => setFormOpen(false)}
        />
      ) : (
        <Button
          variant="outline"
          size="lg"
          className="self-start"
          onClick={() => setFormOpen(true)}
        >
          {submission?.status === DriverLicenseStatus.PENDING ? 'Nộp lại GPLX' : 'Nộp GPLX mới'}
        </Button>
      )}
    </div>
  );
}

type Tone = 'success' | 'warning' | 'danger';

const toneClass: Record<Tone, string> = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-destructive/10 text-destructive',
};

interface StatusView {
  label: string;
  tone: Tone;
  icon: ReactNode;
}

const STATUS_VIEWS: Record<DriverLicenseStatus, StatusView> = {
  PENDING: { label: 'Chờ duyệt', tone: 'warning', icon: <ClockIcon aria-hidden /> },
  REJECTED: { label: 'Bị từ chối', tone: 'danger', icon: <CircleAlertIcon aria-hidden /> },
  EXPIRED: { label: 'Đã hết hạn', tone: 'danger', icon: <CircleAlertIcon aria-hidden /> },
  APPROVED: { label: 'Đã duyệt', tone: 'success', icon: <CircleCheckIcon aria-hidden /> },
};

const EXPIRING_SOON: StatusView = {
  label: 'Sắp hết hạn',
  tone: 'warning',
  icon: <TriangleAlertIcon aria-hidden />,
};

function statusOf(license: DriverLicense, today: string): StatusView {
  // Same lead time as the reminder email.
  const expiringSoon =
    license.status === DriverLicenseStatus.APPROVED &&
    license.expiresOn <= addDays(today, DRIVER_LICENSE_EXPIRY_REMINDER_DAYS);
  return expiringSoon ? EXPIRING_SOON : STATUS_VIEWS[license.status];
}

function LicenseCard({
  license,
  title,
  note,
}: {
  license: DriverLicense;
  title: string;
  note?: string;
}) {
  const status = statusOf(license, vietnamDate());
  const rows: [string, string][] = [
    ['Họ tên', license.fullName],
    ['Số GPLX', license.licenseNumber],
    ['Hạng', DRIVER_LICENSE_CLASS_LABELS[license.licenseClass]],
    ['Ngày sinh', formatIsoDate(license.dateOfBirth)],
    ['Có giá trị đến', formatIsoDate(license.expiresOn)],
    ['Ngày nộp', formatDateTime(new Date(license.submittedAt))],
  ];

  return (
    <Section
      title={title}
      action={
        <Badge className={toneClass[status.tone]}>
          {status.icon}
          {status.label}
        </Badge>
      }
    >
      {license.status === DriverLicenseStatus.REJECTED && license.rejectionReason && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Lý do từ chối: {license.rejectionReason}
        </p>
      )}
      {license.status === DriverLicenseStatus.EXPIRED && (
        <p className="text-sm text-destructive">
          GPLX đã hết hạn. Vui lòng nộp GPLX mới để đặt xe.
        </p>
      )}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['Mặt trước', license.frontImageUrl],
            ['Mặt sau', license.backImageUrl],
          ] as const
        ).map(([label, url]) => (
          <a
            key={label}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col gap-1 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* oxlint-disable-next-line nextjs/no-img-element -- private, short-lived presigned URL */}
            <img
              src={url}
              alt={`GPLX ${label.toLowerCase()}`}
              className="aspect-[1.586] w-full rounded-lg border object-cover group-hover:opacity-90"
            />
            <span className="text-xs text-muted-foreground">{label}</span>
          </a>
        ))}
      </div>
    </Section>
  );
}

/** The shared schema, with Vietnamese messages for the two photos the form uploads. */
const licenseFormSchema = submitDriverLicenseSchema.extend({
  frontUploadKey: z.string().min(1, { error: 'Vui lòng tải ảnh mặt trước.' }),
  backUploadKey: z.string().min(1, { error: 'Vui lòng tải ảnh mặt sau.' }),
});

const NEW_CLASSES = Object.values(DriverLicenseClass).filter((c) => !c.startsWith('LEGACY_'));
const LEGACY_CLASSES = Object.values(DriverLicenseClass).filter((c) => c.startsWith('LEGACY_'));

function SubmitForm({
  base,
  onDone,
  onCancel,
}: {
  /** Previous submission or license, to prefill the details when resubmitting. */
  base: DriverLicense | null;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: user, isPending: sessionPending } = useSession();
  const resend = useResendVerification();
  const form = useZodForm<LicenseFormInput, LicenseFormOutput>(licenseFormSchema, {
    defaultValues: {
      fullName: base?.fullName ?? user?.fullName ?? '',
      licenseNumber: base?.licenseNumber ?? '',
      licenseClass: base?.licenseClass,
      dateOfBirth: base?.dateOfBirth ?? '',
      expiresOn: '',
      frontUploadKey: '',
      backUploadKey: '',
    },
  });

  const submit = useMutation({
    mutationFn: (input: z.output<typeof licenseFormSchema>) =>
      api.put<MyDriverLicenses>('/me/driver-license', input),
    meta: { errorToast: false },
    onSuccess: (data) => {
      queryClient.setQueryData(DRIVER_LICENSES_QUERY_KEY, data);
      // The profile's birth date comes from the license.
      void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      toast.success('Đã nộp GPLX. Kết quả duyệt sẽ được gửi qua email.');
      onDone();
    },
    onError: (error) => {
      applyApiError(
        error,
        form.setError,
        ['fullName', 'licenseNumber', 'licenseClass', 'dateOfBirth', 'expiresOn'],
        { [ErrorCode.DRIVER_LICENSE_TAKEN]: 'licenseNumber' },
      );
    },
  });

  if (sessionPending) return <LoadingState />;

  // Submitting needs a verified email (the API answers EMAIL_NOT_VERIFIED); say so up front
  // rather than after the photos are uploaded.
  if (user && !user.emailVerified) {
    return (
      <Section title="Nộp GPLX">
        <EmptyState
          icon={MailWarningIcon}
          title="Xác thực email trước khi nộp GPLX"
          description={`Mở link xác thực đã gửi tới ${user.email}.`}
          className="p-0"
          action={
            <Button disabled={resend.isPending} onClick={() => resend.mutate()}>
              {resend.isPending ? 'Đang gửi…' : 'Gửi lại email xác thực'}
            </Button>
          }
        />
      </Section>
    );
  }

  return (
    <Section
      title={base ? 'Nộp lại GPLX' : 'Nộp GPLX'}
      description="Chụp rõ hai mặt GPLX. Ảnh chỉ bạn và quản trị viên xem được."
    >
      <form
        noValidate
        onSubmit={(event) => void form.handleSubmit((input) => submit.mutate(input))(event)}
      >
        <FieldGroup>
          <FormError message={form.formState.errors.root?.server?.message} />
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['frontUploadKey', 'Mặt trước', 'Mặt có ảnh chân dung'],
                ['backUploadKey', 'Mặt sau', 'Mặt có các hạng xe'],
              ] as const
            ).map(([name, label, hint]) => (
              <Controller
                key={name}
                control={form.control}
                name={name}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`license-${name}`}>{label}</FieldLabel>
                    <ImagePicker
                      id={`license-${name}`}
                      purpose={UploadPurpose.DRIVER_LICENSE}
                      value={field.value}
                      onChange={(key) => field.onChange(key ?? '')}
                      label={label}
                      hint={hint}
                      invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            ))}
          </div>

          <TextField form={form} name="fullName" label="Họ tên trên GPLX" autoComplete="name" />
          <TextField
            form={form}
            name="licenseNumber"
            label="Số GPLX"
            inputMode="numeric"
            placeholder="12 chữ số"
          />
          <Controller
            control={form.control}
            name="licenseClass"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="license-class">Hạng</FieldLabel>
                <select
                  id="license-class"
                  name={field.name}
                  ref={field.ref}
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.invalid}
                  className={cn(
                    'h-10 rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm',
                    !field.value && 'text-muted-foreground',
                  )}
                >
                  <option value="" disabled>
                    Chọn hạng ghi trên GPLX
                  </option>
                  <optgroup label="GPLX cấp từ 2025">
                    {NEW_CLASSES.map((value) => (
                      <option key={value} value={value}>
                        {DRIVER_LICENSE_CLASS_LABELS[value]}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="GPLX mẫu cũ">
                    {LEGACY_CLASSES.map((value) => (
                      <option key={value} value={value}>
                        {DRIVER_LICENSE_CLASS_LABELS[value]}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField form={form} name="dateOfBirth" label="Ngày sinh" type="date" />
            <TextField
              form={form}
              name="expiresOn"
              label="Có giá trị đến"
              type="date"
              description="Ghi ở mặt trước GPLX."
            />
          </div>

          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
                Huỷ
              </Button>
            )}
            <Button type="submit" size="lg" disabled={submit.isPending}>
              {submit.isPending ? 'Đang nộp…' : 'Nộp GPLX'}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </Section>
  );
}

type LicenseFormInput = z.input<typeof licenseFormSchema>;
type LicenseFormOutput = z.output<typeof licenseFormSchema>;
type LicenseForm = UseFormReturn<LicenseFormInput, unknown, LicenseFormOutput>;

function TextField({
  form,
  name,
  label,
  description,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
}: {
  form: LicenseForm;
  name: 'fullName' | 'licenseNumber' | 'dateOfBirth' | 'expiresOn';
  label: string;
  description?: string;
  type?: 'text' | 'date';
  inputMode?: 'numeric' | 'text';
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`license-${name}`}>{label}</FieldLabel>
          <Input
            {...field}
            value={field.value ?? ''}
            id={`license-${name}`}
            type={type}
            inputMode={inputMode}
            autoComplete={autoComplete}
            placeholder={placeholder}
            aria-invalid={fieldState.invalid}
            className="h-10"
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}
