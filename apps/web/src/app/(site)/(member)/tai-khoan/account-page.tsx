'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { DriverLicenseTab } from './driver-license-tab';
import { PasswordTab } from './password-tab';
import { ProfileTab } from './profile-tab';

const TABS = [
  { value: 'ho-so', label: 'Hồ sơ' },
  { value: 'gplx', label: 'GPLX' },
  { value: 'mat-khau', label: 'Mật khẩu' },
] as const;
type Tab = (typeof TABS)[number]['value'];

function isTab(value: string | null): value is Tab {
  return TABS.some((tab) => tab.value === value);
}

/** `/tai-khoan?tab=…`: other pages link straight to a tab, e.g. `?tab=gplx` before booking. */
export function AccountPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = isTab(requested) ? requested : 'ho-so';

  const select = (value: unknown) => {
    if (typeof value !== 'string' || !isTab(value)) return;
    router.replace(value === 'ho-so' ? pathname : `${pathname}?tab=${value}`, { scroll: false });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight">Tài khoản</h1>
      <Tabs value={tab} onValueChange={select}>
        <TabsList className="w-full sm:w-fit">
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="flex-1 sm:flex-none sm:px-4">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="ho-so" className="pt-4">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="gplx" className="pt-4">
          <DriverLicenseTab />
        </TabsContent>
        <TabsContent value="mat-khau" className="pt-4">
          <PasswordTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
