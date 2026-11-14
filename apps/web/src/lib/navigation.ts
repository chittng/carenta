import {
  BanknoteIcon,
  CarFrontIcon,
  CarIcon,
  ClipboardListIcon,
  IdCardIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  MessageCircleIcon,
  ScaleIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';

/** Page paths from SPEC §13, so links are not spelled out across components. */
export const routes = {
  home: '/',
  search: '/tim-xe',
  signIn: '/dang-nhap',
  signUp: '/dang-ky',
  myTrips: '/chuyen-cua-toi',
  myCars: '/xe-cua-toi',
  ownerBookings: '/don-cho-thue',
  wallet: '/vi',
  messages: '/tin-nhan',
  account: '/tai-khoan',
  console: '/console',
  guide: '/huong-dan',
  terms: '/dieu-khoan',
  privacy: '/chinh-sach-bao-mat',
  cancellationPolicy: '/chinh-sach-huy',
} as const;

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Whether `pathname` is `href` or a page below it. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop header links, shown to everyone. */
export const headerNav: NavItem[] = [
  { href: routes.search, label: 'Tìm xe', icon: SearchIcon },
  { href: routes.myCars, label: 'Cho thuê xe', icon: KeyRoundIcon },
];

/** Signed-in user's pages: the account menu on desktop and the account sheet on mobile. */
export const accountNav: NavItem[] = [
  { href: routes.myTrips, label: 'Chuyến của tôi', icon: CarFrontIcon },
  { href: routes.myCars, label: 'Xe của tôi', icon: CarIcon },
  { href: routes.ownerBookings, label: 'Đơn cho thuê', icon: ClipboardListIcon },
  { href: routes.wallet, label: 'Ví Carenta', icon: WalletIcon },
  { href: routes.messages, label: 'Tin nhắn', icon: MessageCircleIcon },
  { href: routes.account, label: 'Tài khoản', icon: UserIcon },
];

/** Mobile bottom tabs (decided 2026-11-14); the last tab opens the account sheet. */
export const mobileTabs: NavItem[] = [
  { href: routes.search, label: 'Tìm xe', icon: SearchIcon },
  { href: routes.myTrips, label: 'Chuyến', icon: CarFrontIcon },
  { href: routes.messages, label: 'Tin nhắn', icon: MessageCircleIcon },
];

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** Console sidebar, following the Console pages in SPEC §13. */
export const consoleNav: NavGroup[] = [
  { items: [{ href: routes.console, label: 'Tổng quan', icon: LayoutDashboardIcon }] },
  {
    label: 'Duyệt',
    items: [
      { href: '/console/gplx', label: 'GPLX', icon: IdCardIcon },
      { href: '/console/xe', label: 'Xe', icon: CarIcon },
    ],
  },
  {
    label: 'Quản lý',
    items: [
      { href: '/console/nguoi-dung', label: 'Người dùng', icon: UsersIcon },
      { href: '/console/don', label: 'Đơn thuê', icon: ClipboardListIcon },
      { href: '/console/tranh-chap', label: 'Khiếu nại', icon: ScaleIcon },
      { href: '/console/rut-tien', label: 'Rút tiền', icon: BanknoteIcon },
    ],
  },
  {
    label: 'Hệ thống',
    items: [{ href: '/console/cau-hinh', label: 'Cấu hình', icon: SettingsIcon }],
  },
];
