export const ALLOWED_DURATIONS = [60, 90, 120] as const;

export function normalizeDuration(raw: string | null): number {
  if (raw == null || raw.trim() === '') return 90;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return 90;
  if ((ALLOWED_DURATIONS as readonly number[]).includes(n)) return n;
  return 90;
}

export function normalizeTechSelection(raw: string | null, activeIds: number[]): number {
  if (activeIds.length === 0) return 0;
  if (raw == null || raw.trim() === '') return activeIds[0];
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return activeIds[0];
  if (activeIds.includes(n)) return n;
  return activeIds[0];
}
