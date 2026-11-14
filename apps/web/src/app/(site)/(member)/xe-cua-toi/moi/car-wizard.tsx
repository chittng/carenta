'use client';

import { MailWarningIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { EmptyState } from '@/components/states/empty-state';
import { LoadingState } from '@/components/states/loading-state';
import { QueryState } from '@/components/states/query-state';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useHydrated } from '@/hooks/use-hydrated';
import { useOwnerCar } from '@/lib/owner-cars';
import { useResendVerification, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { type OwnerCar } from '@carenta/shared';

import { AmenitiesStep } from './amenities-step';
import { BasicStep, type BasicValues } from './basic-step';
import { DocumentsStep } from './documents-step';
import { LocationStep } from './location-step';
import { PhotosStep } from './photos-step';
import { PricingStep } from './pricing-step';
import { ReviewStep } from './review-step';

/**
 * Steps of the listing wizard (spec §4.1). The first save needs the basic details and the
 * address (decided 2026-11-14), so the location comes second; from there every step saves
 * the draft and the URL (`?xe=<id>&buoc=<step>`) lets the owner come back to it.
 */
export const WIZARD_STEPS = [
  { key: 'thong-tin', title: 'Thông tin xe' },
  { key: 'vi-tri', title: 'Vị trí & giao nhận' },
  { key: 'anh', title: 'Ảnh' },
  { key: 'tien-nghi', title: 'Tiện nghi & quy định' },
  { key: 'gia', title: 'Giá & cọc' },
  { key: 'giay-to', title: 'Giấy tờ' },
  { key: 'gui-duyet', title: 'Xem lại & gửi duyệt' },
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number]['key'];

function isStep(value: string | null): value is WizardStep {
  return WIZARD_STEPS.some((step) => step.key === value);
}

export interface StepProps {
  car: OwnerCar;
  goNext: () => void;
  goBack: () => void;
  goTo: (step: WizardStep) => void;
}

export function CarWizard() {
  const hydrated = useHydrated();
  const { data: user, isPending } = useSession();
  // The session is only known in the browser; render what the server did first.
  if (!hydrated || isPending) return <LoadingState />;
  if (user && !user.emailVerified) return <VerifyFirst email={user.email} />;
  return <Wizard />;
}

function Wizard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const carId = params.get('xe');
  const requested = params.get('buoc');
  // Before the first save only the first two steps exist.
  const step: WizardStep = isStep(requested)
    ? carId || requested === 'vi-tri'
      ? requested
      : 'thong-tin'
    : carId
      ? 'anh'
      : 'thong-tin';
  const [basic, setBasic] = useState<BasicValues | null>(null);

  const goTo = (next: WizardStep, id: string | null = carId) => {
    const query = new URLSearchParams();
    if (id) query.set('xe', id);
    query.set('buoc', next);
    router.push(`${pathname}?${query.toString()}`, { scroll: true });
  };
  const index = WIZARD_STEPS.findIndex((s) => s.key === step);
  const neighbour = (offset: number) => WIZARD_STEPS[index + offset]?.key ?? step;

  const car = useOwnerCar(carId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Đăng xe cho thuê</h1>
        <p className="text-sm text-muted-foreground">
          {carId
            ? 'Bản nháp được lưu sau mỗi bước. Bạn có thể quay lại hoàn tất bất cứ lúc nào.'
            : 'Điền thông tin cơ bản và địa chỉ để lưu bản nháp đầu tiên.'}
        </p>
      </div>

      <Stepper
        current={index}
        reachable={carId ? WIZARD_STEPS.length : basic ? 2 : 1}
        onSelect={(key) => goTo(key)}
      />

      {!carId ? (
        step === 'vi-tri' && basic ? (
          <LocationStep
            car={null}
            basic={basic}
            goBack={() => goTo('thong-tin')}
            onCreated={(created) => goTo('anh', created.id)}
          />
        ) : (
          <BasicStep
            car={null}
            initial={basic}
            onDone={(values) => {
              setBasic(values);
              goTo('vi-tri');
            }}
          />
        )
      ) : (
        <QueryState query={car}>
          {(data) =>
            data.status === 'DRAFT' || data.status === 'REJECTED' ? (
              <StepBody
                step={step}
                props={{
                  car: data,
                  goNext: () => goTo(neighbour(1)),
                  goBack: () => goTo(neighbour(-1)),
                  goTo,
                }}
              />
            ) : (
              <ReviewStep
                car={data}
                goNext={() => undefined}
                goBack={() => goTo('giay-to')}
                goTo={goTo}
              />
            )
          }
        </QueryState>
      )}
    </div>
  );
}

const STEP_VIEWS: Record<WizardStep, (props: StepProps) => ReactNode> = {
  'thong-tin': (props) => <BasicStep car={props.car} initial={null} onDone={props.goNext} />,
  'vi-tri': (props) => (
    <LocationStep car={props.car} basic={null} goBack={props.goBack} onSaved={props.goNext} />
  ),
  anh: (props) => <PhotosStep {...props} />,
  'tien-nghi': (props) => <AmenitiesStep {...props} />,
  gia: (props) => <PricingStep {...props} />,
  'giay-to': (props) => <DocumentsStep {...props} />,
  'gui-duyet': (props) => <ReviewStep {...props} />,
};

function StepBody({ step, props }: { step: WizardStep; props: StepProps }) {
  return STEP_VIEWS[step](props);
}

function Stepper({
  current,
  reachable,
  onSelect,
}: {
  current: number;
  /** Steps that can be opened: before the first save only the ones filled in so far. */
  reachable: number;
  onSelect: (step: WizardStep) => void;
}) {
  const step = WIZARD_STEPS[current];
  return (
    <nav aria-label="Các bước đăng xe" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 sm:hidden">
        <span className="font-semibold">{step?.title}</span>
        <span className="text-sm text-muted-foreground">
          Bước {current + 1}/{WIZARD_STEPS.length}
        </span>
      </div>
      <Progress
        value={((current + 1) / WIZARD_STEPS.length) * 100}
        aria-label={`Bước ${current + 1} trên ${WIZARD_STEPS.length}`}
        className="sm:hidden"
      />
      <ol className="hidden flex-wrap gap-2 sm:flex">
        {WIZARD_STEPS.map(({ key, title }, i) => (
          <li key={key}>
            <button
              type="button"
              disabled={i >= reachable}
              aria-current={i === current ? 'step' : undefined}
              onClick={() => onSelect(key)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                i === current
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-xs font-semibold',
                  i === current ? 'bg-primary-foreground text-primary' : 'bg-muted',
                )}
              >
                {i + 1}
              </span>
              {title}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function VerifyFirst({ email }: { email: string }) {
  const resend = useResendVerification();
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <EmptyState
        icon={MailWarningIcon}
        title="Xác thực email để đăng xe"
        description={`Mở link xác thực đã gửi tới ${email}, rồi quay lại trang này.`}
        action={
          <Button disabled={resend.isPending} onClick={() => resend.mutate()}>
            {resend.isPending ? 'Đang gửi…' : 'Gửi lại email xác thực'}
          </Button>
        }
      />
    </div>
  );
}
