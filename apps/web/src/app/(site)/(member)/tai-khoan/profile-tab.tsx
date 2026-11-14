'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CameraIcon,
  CircleCheckIcon,
  Loader2Icon,
  MailWarningIcon,
  Trash2Icon,
} from 'lucide-react';
import { type ChangeEvent, useId, useState } from 'react';
import { Controller } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Section } from '@/components/account/section';
import { FormError } from '@/components/auth/form-error';
import { UserAvatar } from '@/components/layout/user-avatar';
import { QueryState } from '@/components/states/query-state';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PROFILE_QUERY_KEY, useMyProfile } from '@/lib/account';
import { api } from '@/lib/api/client';
import { applyApiError, useZodForm } from '@/lib/forms';
import { SESSION_QUERY_KEY } from '@/lib/query-client';
import { useResendVerification } from '@/lib/session';
import { IMAGE_ACCEPT, imageFileIssue, uploadImage } from '@/lib/uploads';
import {
  fullNameSchema,
  formatIsoDate,
  type MyProfile,
  phoneSchema,
  UploadPurpose,
} from '@carenta/shared';

export function ProfileTab() {
  const profile = useMyProfile();
  return (
    <QueryState query={profile}>
      {(data) => (
        <div className="flex flex-col gap-4">
          <AvatarSection profile={data} />
          <ProfileForm profile={data} />
          <EmailSection profile={data} />
        </div>
      )}
    </QueryState>
  );
}

function useProfileSaved() {
  const queryClient = useQueryClient();
  return (profile: MyProfile) => {
    queryClient.setQueryData(PROFILE_QUERY_KEY, profile);
    // The header shows the name from the session.
    void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };
}

function AvatarSection({ profile }: { profile: MyProfile }) {
  const inputId = useId();
  const saved = useProfileSaved();
  const [progress, setProgress] = useState<number | null>(null);

  const change = useMutation({
    mutationFn: async (file: File) => {
      const uploadKey = await uploadImage(file, UploadPurpose.AVATAR, { onProgress: setProgress });
      return api.put<MyProfile>('/me/profile/avatar', { uploadKey });
    },
    onSuccess: (data) => {
      saved(data);
      toast.success('Đã đổi ảnh đại diện.');
    },
    onSettled: () => setProgress(null),
  });
  const remove = useMutation({
    mutationFn: () => api.delete<MyProfile>('/me/profile/avatar'),
    onSuccess: (data) => {
      saved(data);
      toast.success('Đã xoá ảnh đại diện.');
    },
  });
  const busy = change.isPending || remove.isPending;

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const issue = imageFileIssue(file);
    if (issue) {
      toast.error(issue);
      return;
    }
    change.mutate(file);
  };

  return (
    <Section title="Ảnh đại diện" description="Hiện trên hồ sơ công khai và khi nhắn tin.">
      <div className="flex items-center gap-4">
        <div className="relative">
          {profile.avatarUrl ? (
            <Avatar className="size-20">
              <AvatarImage src={profile.avatarUrl} alt={profile.fullName} />
            </Avatar>
          ) : (
            <UserAvatar fullName={profile.fullName} className="size-20 text-2xl" />
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 text-xs font-medium">
              {progress !== null && progress < 1 ? (
                `${Math.round(progress * 100)}%`
              ) : (
                <Loader2Icon className="size-5 animate-spin" aria-label="Đang lưu" />
              )}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:pointer-events-none has-disabled:opacity-50"
          >
            <CameraIcon className="size-4" aria-hidden />
            {profile.avatarUrl ? 'Đổi ảnh' : 'Tải ảnh lên'}
            <input
              id={inputId}
              type="file"
              accept={IMAGE_ACCEPT}
              onChange={onPick}
              disabled={busy}
              className="sr-only"
            />
          </label>
          {profile.avatarUrl && (
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => remove.mutate()}>
              <Trash2Icon aria-hidden />
              Xoá ảnh
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Both fields are sent: the API treats them as a partial update. */
const profileFormSchema = z.object({ fullName: fullNameSchema, phone: phoneSchema });

function ProfileForm({ profile }: { profile: MyProfile }) {
  const saved = useProfileSaved();
  const form = useZodForm(profileFormSchema, {
    defaultValues: { fullName: profile.fullName, phone: profile.phone ?? '' },
  });

  const update = useMutation({
    mutationFn: (input: z.output<typeof profileFormSchema>) =>
      api.patch<MyProfile>('/me/profile', input),
    meta: { errorToast: false },
    onSuccess: (data) => {
      saved(data);
      // Show the phone as the API stored it (normalised to 0912345678).
      form.reset({ fullName: data.fullName, phone: data.phone ?? '' });
      toast.success('Đã lưu hồ sơ.');
    },
    onError: (error) => {
      applyApiError(error, form.setError, ['fullName', 'phone']);
    },
  });

  return (
    <Section title="Thông tin cá nhân">
      <form
        noValidate
        onSubmit={(event) => void form.handleSubmit((input) => update.mutate(input))(event)}
      >
        <FieldGroup>
          <FormError message={form.formState.errors.root?.server?.message} />
          <Controller
            control={form.control}
            name="fullName"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="profile-name">Họ và tên</FieldLabel>
                <Input
                  {...field}
                  id="profile-name"
                  autoComplete="name"
                  aria-invalid={fieldState.invalid}
                  className="h-10"
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="phone"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="profile-phone">Số điện thoại</FieldLabel>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  id="profile-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0912 345 678"
                  aria-invalid={fieldState.invalid}
                  className="h-10"
                />
                <FieldDescription>
                  Không bắt buộc. Chỉ hiện cho bên kia sau khi chuyến được xác nhận.
                </FieldDescription>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <Field>
            <FieldLabel htmlFor="profile-dob">Ngày sinh</FieldLabel>
            <Input
              id="profile-dob"
              value={profile.dateOfBirth ? formatIsoDate(profile.dateOfBirth) : 'Chưa có'}
              readOnly
              disabled
              className="h-10"
            />
            <FieldDescription>Lấy từ GPLX bạn đã nộp.</FieldDescription>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={update.isPending || !form.formState.isDirty}>
              {update.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </Section>
  );
}

function EmailSection({ profile }: { profile: MyProfile }) {
  const resend = useResendVerification();
  return (
    <Section
      title="Email"
      description="Dùng để đăng nhập và nhận thông báo. Không đổi được email."
      action={
        profile.emailVerified ? (
          <Badge className="bg-success text-success-foreground">
            <CircleCheckIcon aria-hidden />
            Đã xác thực
          </Badge>
        ) : (
          <Badge className="bg-warning text-warning-foreground">
            <MailWarningIcon aria-hidden />
            Chưa xác thực
          </Badge>
        )
      }
    >
      <p className="font-medium break-all">{profile.email}</p>
      {!profile.emailVerified && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Xác thực email để đặt xe, đăng xe, nộp GPLX và nhắn tin.
          </p>
          <Button
            variant="outline"
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
            className="shrink-0"
          >
            {resend.isPending ? 'Đang gửi…' : 'Gửi lại email xác thực'}
          </Button>
        </div>
      )}
    </Section>
  );
}
