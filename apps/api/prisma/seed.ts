// Seeds catalogue data and the admin account. Safe to run repeatedly: existing rows are
// updated in place, nothing is deleted. Upserts run one at a time on purpose: the data is
// small and sequential writes keep failures easy to read.
/* oxlint-disable no-await-in-loop */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { AMENITIES, CAR_MAKES, HOLIDAY_BREAKS, PLATFORM_SETTINGS } from './seed-data/catalog.js';
import { expandDateRange, slugify } from './seed-data/utils.js';

const DEV_ADMIN_EMAIL = 'admin@carenta.local';
const DEV_ADMIN_PASSWORD = 'Carenta@123';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function seedCarMakes() {
  let modelCount = 0;
  for (const { name, models } of CAR_MAKES) {
    const slug = slugify(name);
    const make = await prisma.carMake.upsert({
      where: { slug },
      create: { name, slug },
      update: { name },
    });
    for (const modelName of models) {
      const modelSlug = slugify(modelName);
      await prisma.carModel.upsert({
        where: { makeId_slug: { makeId: make.id, slug: modelSlug } },
        create: { makeId: make.id, name: modelName, slug: modelSlug },
        update: { name: modelName },
      });
      modelCount += 1;
    }
  }
  console.warn(`Car makes: ${CAR_MAKES.length}, models: ${modelCount}`);
}

async function seedAmenities() {
  for (const [index, { code, name }] of AMENITIES.entries()) {
    await prisma.amenity.upsert({
      where: { code },
      create: { code, name, sortOrder: index },
      update: { name, sortOrder: index },
    });
  }
  console.warn(`Amenities: ${AMENITIES.length}`);
}

async function seedHolidays() {
  let dayCount = 0;
  for (const { name, from, to } of HOLIDAY_BREAKS) {
    for (const date of expandDateRange(from, to)) {
      await prisma.holiday.upsert({ where: { date }, create: { date, name }, update: { name } });
      dayCount += 1;
    }
  }
  console.warn(`Holidays: ${dayCount} days`);
}

async function seedPlatformSettings() {
  for (const { key, value } of PLATFORM_SETTINGS) {
    // Keep values an admin may already have changed in Console
    await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  console.warn(`Platform settings: ${PLATFORM_SETTINGS.length}`);
}

async function seedAdmin() {
  const isProduction = process.env.NODE_ENV === 'production';
  const email = (process.env.ADMIN_EMAIL || (isProduction ? '' : DEV_ADMIN_EMAIL)).toLowerCase();
  const password = process.env.ADMIN_PASSWORD || (isProduction ? '' : DEV_ADMIN_PASSWORD);
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in production');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Never overwrite the password of an existing account
    await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });
    console.warn(`Admin: ${email} (already exists, password unchanged)`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hash(password),
      fullName: process.env.ADMIN_NAME || 'Quản trị viên Carenta',
      role: 'ADMIN',
      emailVerifiedAt: new Date(),
    },
  });
  console.warn(`Admin: ${email} (created)`);
}

async function main() {
  await seedCarMakes();
  await seedAmenities();
  await seedHolidays();
  await seedPlatformSettings();
  await seedAdmin();
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
