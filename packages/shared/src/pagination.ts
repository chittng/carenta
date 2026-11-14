import { z } from 'zod';

// ─── Pagination ─────────────────────────────────────────────────────────────

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
});

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.int(),
    pageSize: z.int(),
    /** Matching items across all pages. */
    total: z.int(),
  });

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number };
