export function parseWeekOffset(raw: string | null): number {
  if (raw == null || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) return 0;
  return n;
}
