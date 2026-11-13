/** `@db.Date` columns come back as midnight UTC; these convert to and from `YYYY-MM-DD`. */
export const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);
export const fromDateOnly = (date: string) => new Date(`${date}T00:00:00.000Z`);
