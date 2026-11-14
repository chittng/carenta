'use client';

import { PhotoManager } from '@/components/uploads/photo-manager';
import { api } from '@/lib/api/client';
import { useSetOwnerCar } from '@/lib/owner-cars';
import { CAR_PHOTO_MAX, CAR_PHOTO_MIN, type OwnerCar, UploadPurpose } from '@carenta/shared';

import { type StepProps } from './car-wizard';
import { StepActions } from './step-actions';

/**
 * Step 3: 4–15 photos, the first one is the cover (spec §4.1). Each photo is saved as soon
 * as it is uploaded; on phones the file picker also offers the camera.
 */
export function PhotosStep({ car, goNext, goBack }: StepProps) {
  const setCar = useSetOwnerCar();
  const save = async (request: Promise<OwnerCar>) => setCar(await request);
  const missing = Math.max(0, CAR_PHOTO_MIN - car.photos.length);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Ảnh xe</h2>
        <p className="text-sm text-muted-foreground">
          Cần từ {CAR_PHOTO_MIN} đến {CAR_PHOTO_MAX} ảnh: phía trước, phía sau, hai bên và nội thất.
          Ảnh rõ, đủ sáng giúp xe được đặt nhiều hơn.
        </p>
      </div>
      <PhotoManager
        photos={car.photos.map((photo) => ({ id: photo.id, url: photo.urls.sm }))}
        purpose={UploadPurpose.CAR_PHOTO}
        max={CAR_PHOTO_MAX}
        onAdd={(uploadKey) =>
          save(api.post<OwnerCar>(`/owner/cars/${car.id}/photos`, { uploadKey }))
        }
        onReorder={(photoIds) =>
          save(api.put<OwnerCar>(`/owner/cars/${car.id}/photos/order`, { photoIds }))
        }
        onRemove={(photoId) =>
          save(api.delete<OwnerCar>(`/owner/cars/${car.id}/photos/${photoId}`))
        }
      />
      {missing > 0 && (
        <p className="text-sm text-muted-foreground">
          Còn thiếu {missing} ảnh để gửi duyệt. Bạn vẫn có thể làm các bước khác trước.
        </p>
      )}
      <StepActions onBack={goBack} onNext={goNext} submitLabel="Tiếp tục" />
    </div>
  );
}
