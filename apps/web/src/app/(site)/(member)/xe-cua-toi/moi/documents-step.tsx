'use client';

import { useMutation } from '@tanstack/react-query';
import { CircleCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Section } from '@/components/account/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ImagePicker } from '@/components/uploads/image-picker';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { useSetOwnerCar } from '@/lib/owner-cars';
import {
  CAR_DOCUMENT_TYPE_LABELS,
  CarDocumentType,
  documentExpirySchema,
  formatIsoDate,
  type OwnerCar,
  UploadPurpose,
} from '@carenta/shared';

import { type StepProps } from './car-wizard';
import { StepActions } from './step-actions';

/**
 * Step 6: vehicle registration and a valid inspection certificate (spec §3, §4.1). Private:
 * only the owner and admins see them. Each one is saved on its own.
 */
export function DocumentsStep({ car, goNext, goBack }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Giấy tờ xe</h2>
        <p className="text-sm text-muted-foreground">
          Chỉ bạn và quản trị viên xem được, không hiện trên trang công khai.
        </p>
      </div>
      <DocumentCard car={car} type={CarDocumentType.REGISTRATION} />
      <DocumentCard car={car} type={CarDocumentType.INSPECTION} />
      <StepActions onBack={goBack} onNext={goNext} submitLabel="Tiếp tục" />
    </div>
  );
}

function DocumentCard({ car, type }: { car: OwnerCar; type: CarDocumentType }) {
  const setCar = useSetOwnerCar();
  const saved = car.documents.find((document) => document.type === type);
  const needsExpiry = type === CarDocumentType.INSPECTION;
  const [key, setKey] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState(saved?.expiresOn ?? '');
  const [expiryError, setExpiryError] = useState<string | null>(null);
  // Remount the picker after saving so it shows the stored document again.
  const [round, setRound] = useState(0);
  const label = CAR_DOCUMENT_TYPE_LABELS[type];

  const save = useMutation({
    mutationFn: () =>
      api.put<OwnerCar>(`/owner/cars/${car.id}/documents/${type}`, {
        uploadKey: key,
        ...(needsExpiry ? { expiresOn } : {}),
      }),
    meta: { errorToast: false },
    onSuccess: (data) => {
      setCar(data);
      setKey(null);
      setRound((n) => n + 1);
      toast.success(`Đã lưu ${label.toLowerCase()}.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submit = () => {
    if (needsExpiry) {
      const checked = documentExpirySchema.safeParse(expiresOn);
      if (!checked.success) {
        setExpiryError(checked.error.issues[0]?.message ?? 'Ngày hết hạn không hợp lệ.');
        return;
      }
    }
    setExpiryError(null);
    save.mutate();
  };

  return (
    <Section
      title={label}
      action={
        saved ? (
          <Badge className="bg-success text-success-foreground">
            <CircleCheckIcon aria-hidden />
            Đã tải lên
          </Badge>
        ) : (
          <Badge variant="outline">Chưa có</Badge>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <ImagePicker
          key={round}
          id={`document-${type}`}
          purpose={UploadPurpose.CAR_DOCUMENT}
          value={key}
          onChange={setKey}
          label={saved ? 'Thay ảnh khác' : `Ảnh ${label.toLowerCase()}`}
          hint="Chụp rõ, đủ các góc"
          existingUrl={saved?.url ?? null}
        />
        <div className="flex flex-col gap-4">
          {needsExpiry && (
            <Field data-invalid={expiryError !== null}>
              <FieldLabel htmlFor={`expiry-${type}`}>Hạn đăng kiểm</FieldLabel>
              <Input
                id={`expiry-${type}`}
                type="date"
                value={expiresOn}
                onChange={(event) => setExpiresOn(event.target.value)}
                aria-invalid={expiryError !== null}
                className="h-10"
              />
              <FieldError>{expiryError}</FieldError>
            </Field>
          )}
          {saved?.expiresOn && (
            <p className="text-sm text-muted-foreground">
              Đang lưu: có hạn đến {formatIsoDate(saved.expiresOn)}.
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="self-start"
            disabled={save.isPending || key === null || (needsExpiry && expiresOn === '')}
            onClick={submit}
          >
            {save.isPending ? 'Đang lưu…' : saved ? 'Lưu ảnh mới' : 'Lưu'}
          </Button>
        </div>
      </div>
    </Section>
  );
}
