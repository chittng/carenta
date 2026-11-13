// Catalogue seeded into a fresh database. Admins maintain it in Console afterwards.

/** Popular makes and models on the Vietnamese rental market. */
export const CAR_MAKES: ReadonlyArray<{ name: string; models: readonly string[] }> = [
  {
    name: 'Toyota',
    models: [
      'Vios',
      'Corolla Altis',
      'Corolla Cross',
      'Yaris Cross',
      'Raize',
      'Veloz Cross',
      'Avanza Premio',
      'Innova',
      'Innova Cross',
      'Fortuner',
      'Camry',
      'Hilux',
      'Wigo',
    ],
  },
  {
    name: 'Hyundai',
    models: [
      'Grand i10',
      'Accent',
      'Elantra',
      'Venue',
      'Creta',
      'Stargazer',
      'Tucson',
      'Santa Fe',
      'Custin',
      'Palisade',
    ],
  },
  {
    name: 'Kia',
    models: [
      'Morning',
      'Soluto',
      'K3',
      'K5',
      'Sonet',
      'Seltos',
      'Carens',
      'Sportage',
      'Sorento',
      'Carnival',
    ],
  },
  {
    name: 'Mazda',
    models: ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-30', 'CX-5', 'CX-8', 'BT-50'],
  },
  {
    name: 'Honda',
    models: ['Brio', 'City', 'Civic', 'HR-V', 'BR-V', 'CR-V', 'Accord'],
  },
  {
    name: 'Mitsubishi',
    models: [
      'Attrage',
      'Xpander',
      'Xpander Cross',
      'Xforce',
      'Destinator',
      'Outlander',
      'Pajero Sport',
      'Triton',
    ],
  },
  {
    name: 'Ford',
    models: ['Territory', 'Everest', 'Ranger', 'Transit', 'EcoSport'],
  },
  {
    name: 'VinFast',
    models: [
      'VF 3',
      'VF 5',
      'VF 6',
      'VF 7',
      'VF 8',
      'VF 9',
      'VF e34',
      'Limo Green',
      'Fadil',
      'Lux A2.0',
      'Lux SA2.0',
    ],
  },
  {
    name: 'Suzuki',
    models: ['Swift', 'Ciaz', 'Ertiga', 'XL7', 'Jimny'],
  },
  {
    name: 'Nissan',
    models: ['Almera', 'Kicks', 'Navara', 'Terra'],
  },
  {
    name: 'Isuzu',
    models: ['D-Max', 'mu-X'],
  },
  {
    name: 'Peugeot',
    models: ['2008', '3008', '5008'],
  },
  {
    name: 'Chevrolet',
    models: ['Spark', 'Aveo', 'Cruze', 'Captiva', 'Colorado', 'Trailblazer'],
  },
  {
    name: 'Mercedes-Benz',
    models: ['A-Class', 'C-Class', 'E-Class', 'GLC', 'GLE'],
  },
  {
    name: 'BMW',
    models: ['3 Series', '5 Series', 'X3', 'X5'],
  },
  {
    name: 'Audi',
    models: ['A4', 'A6', 'Q5', 'Q7'],
  },
  {
    name: 'Lexus',
    models: ['ES', 'NX', 'RX'],
  },
  {
    name: 'MG',
    models: ['MG5', 'ZS', 'HS'],
  },
  {
    name: 'BYD',
    models: ['Atto 3', 'Dolphin', 'Seal', 'Sealion 6'],
  },
];

/** Amenities from spec §4.1, in display order. */
export const AMENITIES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'GPS', name: 'Bản đồ/định vị GPS' },
  { code: 'BLUETOOTH', name: 'Bluetooth' },
  { code: 'CARPLAY_ANDROID_AUTO', name: 'Apple CarPlay/Android Auto' },
  { code: 'REVERSE_CAMERA', name: 'Camera lùi' },
  { code: 'CAMERA_360', name: 'Camera 360' },
  { code: 'PARKING_SENSORS', name: 'Cảm biến va chạm' },
  { code: 'BLIND_SPOT_WARNING', name: 'Cảnh báo điểm mù' },
  { code: 'SUNROOF', name: 'Cửa sổ trời' },
  { code: 'LEATHER_SEATS', name: 'Ghế da' },
  { code: 'SOFT_CLOSE_DOORS', name: 'Cửa hít' },
  { code: 'CRUISE_CONTROL', name: 'Cruise control' },
  { code: 'POWER_TAILGATE', name: 'Cốp điện' },
  { code: 'TIRE_PRESSURE_SENSORS', name: 'Cảm biến áp suất lốp' },
  { code: 'CHILD_SEAT', name: 'Ghế trẻ em' },
  { code: 'USB_CHARGING', name: 'Khe cắm USB/sạc' },
  { code: 'ETC', name: 'ETC (thu phí không dừng)' },
  { code: 'SPARE_TIRE', name: 'Lốp dự phòng' },
  { code: 'AIRBAGS', name: 'Túi khí' },
];

/**
 * Holiday breaks as announced for the public sector, inclusive ranges (YYYY-MM-DD).
 * Every day of a break carries the holiday surcharge, weekends inside the break included.
 * Covers 2026 and the start of 2027 so that the 90-day booking window is covered.
 */
export const HOLIDAY_BREAKS: ReadonlyArray<{ name: string; from: string; to: string }> = [
  { name: 'Tết Dương lịch', from: '2026-01-01', to: '2026-01-01' },
  { name: 'Tết Nguyên đán', from: '2026-02-14', to: '2026-02-22' },
  { name: 'Giỗ Tổ Hùng Vương', from: '2026-04-25', to: '2026-04-27' },
  { name: 'Ngày Giải phóng miền Nam và Quốc tế Lao động', from: '2026-04-30', to: '2026-05-03' },
  { name: 'Quốc khánh', from: '2026-08-29', to: '2026-09-02' },
  { name: 'Ngày Văn hóa Việt Nam', from: '2026-11-24', to: '2026-11-24' },
  { name: 'Tết Dương lịch', from: '2027-01-01', to: '2027-01-03' },
  { name: 'Tết Nguyên đán', from: '2027-02-04', to: '2027-02-10' },
];

/** Initial platform settings (spec §6). */
export const PLATFORM_SETTINGS: ReadonlyArray<{ key: string; value: number }> = [
  { key: 'commission_rate_percent', value: 15 },
];
