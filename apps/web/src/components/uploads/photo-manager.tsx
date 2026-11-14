'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVerticalIcon,
  ImagePlusIcon,
  RotateCwIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { errorMessage } from '@/lib/api/errors';
import { imageFileIssue, IMAGE_ACCEPT, uploadImage } from '@/lib/uploads';
import { cn } from '@/lib/utils';
import { type UploadPurpose } from '@carenta/shared';

export interface ManagedPhoto {
  id: string;
  /** Thumbnail URL. */
  url: string;
}

export interface PhotoManagerProps {
  /** Saved photos in display order; the first one is the cover. */
  photos: ManagedPhoto[];
  purpose: UploadPurpose;
  /** Most photos allowed, counting uploads in progress. */
  max: number;
  /** Saves an uploaded file (e.g. `POST /owner/cars/:id/photos`) and refreshes `photos`. */
  onAdd: (uploadKey: string) => Promise<unknown>;
  /** Saves a new order (e.g. `PUT /owner/cars/:id/photos/order`) and refreshes `photos`. */
  onReorder: (photoIds: string[]) => Promise<unknown>;
  onRemove: (photoId: string) => Promise<unknown>;
  disabled?: boolean;
  /** Labels the first photo; pass `null` where order does not mean a cover. */
  coverLabel?: string | null;
}

interface PendingUpload {
  localId: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: 'uploading' | 'saving' | 'failed';
  error?: string;
}

/** Uploads at once; more would just compete for the same bandwidth. */
const PARALLEL_UPLOADS = 3;

/**
 * Multi-photo uploader for a saved resource: pick several images, see previews and
 * progress, drag (or use the keyboard) to reorder, set the cover, remove. Files go straight
 * to storage; each finished upload is handed to `onAdd` in the order it was picked.
 */
export function PhotoManager({
  photos,
  purpose,
  max,
  onAdd,
  onReorder,
  onRemove,
  disabled = false,
  coverLabel = 'Ảnh bìa',
}: PhotoManagerProps) {
  const inputId = useId();
  // dnd-kit numbers its aria ids with a global counter, which differs between the server
  // and browser renders; a stable id keeps hydration clean.
  const dndId = useId();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  // `onAdd` calls run one after another so photos are appended in the order they were picked.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const queue = useRef<PendingUpload[]>([]);
  const active = useRef(0);
  const controllers = useRef(new Map<string, AbortController>());

  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const ordered = (draftOrder ?? photos.map((photo) => photo.id))
    .map((id) => byId.get(id))
    .filter((photo) => photo !== undefined);
  const slotsLeft = max - photos.length - pending.length;

  // Revoke preview URLs when uploads leave the list or the component unmounts.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const current = new Set(pending.map((upload) => upload.previewUrl));
    for (const url of previews.current) if (!current.has(url)) URL.revokeObjectURL(url);
    previews.current = current;
  }, [pending]);
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
      for (const controller of controllers.current.values()) controller.abort();
    },
    [],
  );

  const update = (localId: string, patch: Partial<PendingUpload>) =>
    setPending((list) => list.map((u) => (u.localId === localId ? { ...u, ...patch } : u)));

  const runUpload = async (upload: PendingUpload) => {
    const controller = new AbortController();
    controllers.current.set(upload.localId, controller);
    try {
      const key = await uploadImage(upload.file, purpose, {
        signal: controller.signal,
        onProgress: (progress) => update(upload.localId, { progress }),
      });
      update(upload.localId, { status: 'saving', progress: 1 });
      const save = saveChain.current.catch(() => undefined).then(() => onAdd(key));
      saveChain.current = save;
      await save;
      setPending((list) => list.filter((u) => u.localId !== upload.localId));
    } catch (error) {
      if (controller.signal.aborted) return;
      update(upload.localId, { status: 'failed', error: errorMessage(error) });
    } finally {
      controllers.current.delete(upload.localId);
    }
  };

  const pump = () => {
    while (active.current < PARALLEL_UPLOADS && queue.current.length > 0) {
      const next = queue.current.shift();
      if (!next) break;
      active.current += 1;
      void runUpload(next).finally(() => {
        active.current -= 1;
        pump();
      });
    }
  };

  const start = (uploads: PendingUpload[]) => {
    queue.current.push(...uploads);
    pump();
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const accepted: PendingUpload[] = [];
    for (const file of files) {
      const issue = imageFileIssue(file);
      if (issue) {
        toast.error(`${file.name}: ${issue}`);
        continue;
      }
      if (accepted.length >= slotsLeft) {
        toast.error(`Tối đa ${max} ảnh. Một số ảnh chưa được thêm.`);
        break;
      }
      accepted.push({
        localId: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        progress: 0,
        status: 'uploading',
      });
    }
    if (accepted.length === 0) return;
    setPending((list) => [...list, ...accepted]);
    start(accepted);
  };

  const retry = (upload: PendingUpload) => {
    const again = { ...upload, status: 'uploading' as const, progress: 0, error: undefined };
    update(upload.localId, again);
    start([again]);
  };

  const cancel = (upload: PendingUpload) => {
    controllers.current.get(upload.localId)?.abort();
    queue.current = queue.current.filter((u) => u.localId !== upload.localId);
    setPending((list) => list.filter((u) => u.localId !== upload.localId));
  };

  const saveOrder = async (ids: string[]) => {
    setDraftOrder(ids);
    try {
      await onReorder(ids);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDraftOrder(null);
    }
  };

  const remove = async (id: string) => {
    setBusyIds((ids) => new Set(ids).add(id));
    try {
      await onRemove(id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
    }
  };

  const sensors = useSensors(
    // A short drag distance keeps taps on the buttons from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (!over || dragged.id === over.id) return;
    const ids = ordered.map((photo) => photo.id);
    const from = ids.indexOf(String(dragged.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    void saveOrder(arrayMove(ids, from, to));
  };

  const position = (id: string | number) => ordered.findIndex((p) => p.id === String(id)) + 1;

  return (
    <div className="flex flex-col gap-3">
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Nhấn Space hoặc Enter để nhấc ảnh, dùng phím mũi tên để di chuyển, nhấn Space hoặc Enter lần nữa để đặt xuống, Esc để huỷ.',
          },
          announcements: {
            onDragStart: ({ active: a }) => `Đã nhấc ảnh thứ ${position(a.id)}.`,
            onDragOver: ({ over }) => (over ? `Đang ở vị trí ${position(over.id)}.` : undefined),
            onDragEnd: ({ over }) =>
              over ? `Đã đặt ảnh vào vị trí ${position(over.id)}.` : 'Đã đặt ảnh xuống.',
            onDragCancel: () => 'Đã huỷ di chuyển ảnh.',
          },
        }}
      >
        <SortableContext items={ordered.map((p) => p.id)} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ordered.map((photo, index) => (
              <SortablePhoto
                key={photo.id}
                photo={photo}
                index={index}
                coverLabel={coverLabel}
                disabled={disabled || draftOrder !== null}
                removing={busyIds.has(photo.id)}
                onMakeCover={() =>
                  void saveOrder([
                    photo.id,
                    ...ordered.filter((p) => p.id !== photo.id).map((p) => p.id),
                  ])
                }
                onRemove={() => void remove(photo.id)}
              />
            ))}
            {pending.map((upload) => (
              <PendingTile
                key={upload.localId}
                upload={upload}
                onRetry={() => retry(upload)}
                onCancel={() => cancel(upload)}
              />
            ))}
            {slotsLeft > 0 && !disabled && (
              <li>
                <label
                  htmlFor={inputId}
                  className="flex aspect-4/3 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-input text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary has-focus-visible:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <ImagePlusIcon className="size-6" aria-hidden />
                  <span className="font-medium">Thêm ảnh</span>
                  <span className="text-xs">
                    {photos.length + pending.length}/{max}
                  </span>
                  <input
                    id={inputId}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    multiple
                    onChange={onFiles}
                    className="sr-only"
                  />
                </label>
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>
      <p className="text-xs text-muted-foreground">
        JPG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh. Kéo ảnh để sắp xếp
        {coverLabel ? '; ảnh đầu tiên là ảnh bìa.' : '.'}
      </p>
    </div>
  );
}

function SortablePhoto({
  photo,
  index,
  coverLabel,
  disabled,
  removing,
  onMakeCover,
  onRemove,
}: {
  photo: ManagedPhoto;
  index: number;
  coverLabel: string | null;
  disabled: boolean;
  removing: boolean;
  onMakeCover: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.id,
    disabled,
  });
  const isCover = index === 0 && coverLabel !== null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative aspect-4/3 overflow-hidden rounded-lg border bg-muted',
        isDragging && 'z-10 shadow-lg ring-2 ring-primary',
        removing && 'opacity-50',
      )}
    >
      {/* Plain <img>: storage already serves sized thumbnails, and previews are blob: URLs. */}
      {/* oxlint-disable-next-line nextjs/no-img-element */}
      <img
        src={photo.url}
        alt={`Ảnh ${index + 1}`}
        className="size-full object-cover"
        draggable={false}
      />
      {isCover && (
        <span className="absolute top-1.5 left-1.5 rounded-md bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
          {coverLabel}
        </span>
      )}
      <button
        type="button"
        aria-label={`Kéo để sắp xếp ảnh ${index + 1}`}
        disabled={disabled}
        className="absolute inset-0 cursor-grab touch-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:cursor-grabbing disabled:cursor-default"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon
          className="absolute right-1.5 bottom-1.5 size-5 rounded bg-background/80 p-0.5 text-foreground"
          aria-hidden
        />
      </button>
      <div className="absolute top-1.5 right-1.5 flex gap-1">
        {coverLabel !== null && index > 0 && (
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            aria-label={`Đặt ảnh ${index + 1} làm ${coverLabel.toLowerCase()}`}
            title={`Đặt làm ${coverLabel.toLowerCase()}`}
            disabled={disabled || removing}
            onClick={onMakeCover}
          >
            <StarIcon aria-hidden />
          </Button>
        )}
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          aria-label={`Xoá ảnh ${index + 1}`}
          title="Xoá ảnh"
          disabled={disabled || removing}
          onClick={onRemove}
        >
          <Trash2Icon aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function PendingTile({
  upload,
  onRetry,
  onCancel,
}: {
  upload: PendingUpload;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const failed = upload.status === 'failed';
  return (
    <li className="relative aspect-4/3 overflow-hidden rounded-lg border bg-muted">
      {/* oxlint-disable-next-line nextjs/no-img-element -- local blob: preview */}
      <img
        src={upload.previewUrl}
        alt={`Ảnh đang tải lên: ${upload.file.name}`}
        className={cn('size-full object-cover', !failed && 'opacity-60')}
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-background/90 p-2 text-xs">
        {failed ? (
          <>
            <p className="line-clamp-2 text-destructive">{upload.error}</p>
            <div className="flex gap-1">
              <Button type="button" size="xs" variant="outline" onClick={onRetry}>
                <RotateCwIcon aria-hidden />
                Thử lại
              </Button>
              <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
                Bỏ
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">
              {upload.status === 'saving'
                ? 'Đang lưu…'
                : `Đang tải lên ${Math.round(upload.progress * 100)}%`}
            </span>
            <Progress value={Math.round(upload.progress * 100)} aria-label="Tiến độ tải ảnh" />
          </>
        )}
      </div>
      {!failed && (
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          aria-label="Huỷ tải ảnh"
          className="absolute top-1.5 right-1.5"
          onClick={onCancel}
          disabled={upload.status === 'saving'}
        >
          <XIcon aria-hidden />
        </Button>
      )}
    </li>
  );
}
