export function parseWeekOffset(raw: string | null): number {
  if (raw == null || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) return 0;
  return n;
}

/** Local midnight of the given date (rolling 7-day windows start here). */
export function startOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
