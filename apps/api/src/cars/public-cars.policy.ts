import { type Prisma } from '../generated/prisma/client.js';

/** The listing rules shared by public detail, quotes and calendars; search mirrors in SQL. */
export const listedCarWhere = (now: Date): Prisma.CarWhereInput => ({
  status: 'ACTIVE',
  owner: { status: 'ACTIVE' },
  OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: now } }],
});
