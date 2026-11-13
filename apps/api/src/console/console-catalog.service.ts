import { HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  type ConsoleAmenity,
  type ConsoleCarMake,
  type ConsoleCarModel,
  type CreateAmenityInput,
  type CreateCatalogItemInput,
  ErrorCode,
  type UpdateAmenityInput,
  type UpdateCatalogItemInput,
} from '@carenta/shared';

import { AppException } from '../common/errors/app.exception.js';
import { slugify } from '../common/slug.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const MODEL_SELECT = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  _count: { select: { cars: true } },
} as const satisfies Prisma.CarModelSelect;

const MAKE_SELECT = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  models: { orderBy: { name: 'asc' }, select: MODEL_SELECT },
} as const satisfies Prisma.CarMakeSelect;

const AMENITY_SELECT = {
  id: true,
  code: true,
  name: true,
  sortOrder: true,
  isActive: true,
  _count: { select: { cars: true } },
} as const satisfies Prisma.AmenitySelect;

type ModelRecord = Prisma.CarModelGetPayload<{ select: typeof MODEL_SELECT }>;
type MakeRecord = Prisma.CarMakeGetPayload<{ select: typeof MAKE_SELECT }>;
type AmenityRecord = Prisma.AmenityGetPayload<{ select: typeof AMENITY_SELECT }>;

const toModel = ({ _count, ...model }: ModelRecord): ConsoleCarModel => ({
  ...model,
  carCount: _count.cars,
});
const toMake = (make: MakeRecord): ConsoleCarMake => ({
  ...make,
  models: make.models.map(toModel),
});
const toAmenity = ({ _count, ...amenity }: AmenityRecord): ConsoleAmenity => ({
  ...amenity,
  carCount: _count.cars,
});

const notFound = (message: string) =>
  new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, message);

/** Slug of a name, refusing names with no letters or digits (the slug would be empty). */
function slugOf(name: string): string {
  const slug = slugify(name);
  if (slug === '') {
    throw new AppException(
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
      'Tên phải có chữ hoặc số.',
      [{ path: 'name', message: 'Tên phải có chữ hoặc số.' }],
    );
  }
  return slug;
}

/** Maps a unique violation (same name, slug or code) to a readable conflict. */
async function unique<T>(write: Promise<T>, message: string): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppException(HttpStatus.CONFLICT, ErrorCode.CATALOG_DUPLICATE, message);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw notFound('Không tìm thấy mục trong danh mục.');
    }
    throw error;
  }
}

/**
 * Makes, models and amenities in Console (spec §11). Nothing is deleted (decided
 * 2026-11-14): a turned-off item disappears from the listing form and filters, and cars
 * that use it keep it.
 */
@Injectable()
export class ConsoleCatalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMakes(): Promise<ConsoleCarMake[]> {
    const makes = await this.prisma.carMake.findMany({
      orderBy: { name: 'asc' },
      select: MAKE_SELECT,
    });
    return makes.map(toMake);
  }

  async createMake(input: CreateCatalogItemInput): Promise<ConsoleCarMake> {
    const make = await unique(
      this.prisma.carMake.create({
        data: { name: input.name, slug: slugOf(input.name) },
        select: MAKE_SELECT,
      }),
      'Đã có hãng xe này.',
    );
    return toMake(make);
  }

  async updateMake(id: number, input: UpdateCatalogItemInput): Promise<ConsoleCarMake> {
    const make = await unique(
      this.prisma.carMake.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name, slug: slugOf(input.name) }),
          isActive: input.isActive,
        },
        select: MAKE_SELECT,
      }),
      'Đã có hãng xe này.',
    );
    return toMake(make);
  }

  async createModel(makeId: number, input: CreateCatalogItemInput): Promise<ConsoleCarModel> {
    const make = await this.prisma.carMake.findUnique({
      where: { id: makeId },
      select: { id: true },
    });
    if (!make) throw notFound('Không tìm thấy hãng xe.');
    const model = await unique(
      this.prisma.carModel.create({
        data: { makeId, name: input.name, slug: slugOf(input.name) },
        select: MODEL_SELECT,
      }),
      'Hãng xe này đã có dòng xe cùng tên.',
    );
    return toModel(model);
  }

  async updateModel(id: number, input: UpdateCatalogItemInput): Promise<ConsoleCarModel> {
    const model = await unique(
      this.prisma.carModel.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name, slug: slugOf(input.name) }),
          isActive: input.isActive,
        },
        select: MODEL_SELECT,
      }),
      'Hãng xe này đã có dòng xe cùng tên.',
    );
    return toModel(model);
  }

  async listAmenities(): Promise<ConsoleAmenity[]> {
    const amenities = await this.prisma.amenity.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: AMENITY_SELECT,
    });
    return amenities.map(toAmenity);
  }

  async createAmenity(input: CreateAmenityInput): Promise<ConsoleAmenity> {
    const amenity = await unique(
      this.prisma.amenity.create({ data: input, select: AMENITY_SELECT }),
      'Đã có tiện nghi với mã này.',
    );
    return toAmenity(amenity);
  }

  async updateAmenity(id: number, input: UpdateAmenityInput): Promise<ConsoleAmenity> {
    const amenity = await unique(
      this.prisma.amenity.update({ where: { id }, data: input, select: AMENITY_SELECT }),
      'Đã có tiện nghi với mã này.',
    );
    return toAmenity(amenity);
  }
}
