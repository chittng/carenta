'use client';

import { ImagePlusIcon, RotateCwIcon } from 'lucide-react';
import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { errorMessage } from '@/lib/api/errors';
import { IMAGE_ACCEPT, imageFileIssue, uploadImage } from '@/lib/uploads';
import { cn } from '@/lib/utils';
import { type UploadPurpose } from '@carenta/shared';

type State =
  | { status: 'idle' }
  | { status: 'uploading'; file: File; preview: string; progress: number }
  | { status: 'failed'; file: File; preview: string; error: string }
  | { status: 'done'; file: File; preview: string };

/**
 * One image for a form field (e.g. each side of a driver license): the file is uploaded as
 * soon as it is picked, and the field gets the upload `key` to send with the form. Shows a
 * preview, progress, and retry on failure.
 */
export function ImagePicker({
  id,
  purpose,
  value,
  onChange,
  label,
  hint,
  invalid = false,
  existingUrl,
  className,
}: {
  id?: string;
  purpose: UploadPurpose;
  /** The upload key, or null/empty before a file is uploaded. */
  value: string | null | undefined;
  onChange: (key: string | null) => void;
  /** Shown inside the empty box, e.g. "Mặt trước". */
  label: string;
  hint?: string;
  invalid?: boolean;
  /** Image already on file, shown until a new one is picked. */
  existingUrl?: string | null;
  className?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [state, setState] = useState<State>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  /** One object URL per picked file; the previous one is revoked. */
  const previewOf = (file: File, current: string | null) => {
    if (current) return current;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    return previewUrl.current;
  };

  const upload = async (file: File, existingPreview: string | null = null) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const preview = previewOf(file, existingPreview);
    setState({ status: 'uploading', file, preview, progress: 0 });
    onChange(null);
    try {
      const key = await uploadImage(file, purpose, {
        signal: abort.signal,
        onProgress: (progress) =>
          setState((current) =>
            current.status === 'uploading' && current.file === file
              ? { ...current, progress }
              : current,
          ),
      });
      setState({ status: 'done', file, preview });
      onChange(key);
    } catch (error) {
      if (abort.signal.aborted) return;
      setState({ status: 'failed', file, preview, error: errorMessage(error) });
    }
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const issue = imageFileIssue(file);
    if (issue) {
      setState({ status: 'failed', file, preview: previewOf(file, null), error: issue });
      onChange(null);
      return;
    }
    void upload(file);
  };

  const shown = state.status === 'idle' ? (existingUrl ?? null) : state.preview;
  const busy = state.status === 'uploading';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label
        htmlFor={inputId}
        className={cn(
          'relative flex aspect-[1.586] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed border-input bg-muted/40 text-sm text-muted-foreground transition-colors hover:border-primary has-focus-visible:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
          invalid && 'border-destructive',
          shown && 'border-solid',
        )}
      >
        {shown ? (
          // oxlint-disable-next-line nextjs/no-img-element -- blob: preview or short-lived presigned URL
          <img src={shown} alt={label} className="absolute inset-0 size-full object-cover" />
        ) : (
          <>
            <ImagePlusIcon className="size-6" aria-hidden />
            <span className="font-medium">{label}</span>
            {hint && <span className="px-3 text-center text-xs">{hint}</span>}
          </>
        )}
        {busy && (
          <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-background/90 p-2 text-xs">
            Đang tải lên {Math.round(state.progress * 100)}%
            <Progress
              value={Math.round(state.progress * 100)}
              aria-label={`Tiến độ tải ${label}`}
            />
          </span>
        )}
        <input
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={onPick}
          disabled={busy}
          aria-invalid={invalid}
          className="sr-only"
        />
      </label>
      {state.status === 'failed' ? (
        <div className="flex items-center justify-between gap-2 text-sm text-destructive">
          <span>{state.error}</span>
          {!imageFileIssue(state.file) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void upload(state.file, state.preview)}
            >
              <RotateCwIcon aria-hidden />
              Thử lại
            </Button>
          )}
        </div>
      ) : (
        shown &&
        !busy && (
          <label htmlFor={inputId} className="cursor-pointer text-sm text-primary hover:underline">
            Chọn ảnh khác
          </label>
        )
      )}
      {value && state.status === 'done' && (
        <span className="sr-only" aria-live="polite">
          Đã tải {label}
        </span>
      )}
    </div>
  );
}
