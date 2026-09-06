import { getVancouverParts, vancouverMidnightEpoch } from './db';

export function parseWeekOffset(raw: string | null): number {
  if (raw == null || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isSafeInteger(n)) return 0;
  return n;
}

// --- Vancouver wall-day helpers ------------------------------------------------
// Day bucketing must use the business timezone, not the server's. Cloudflare
// Workers run on UTC, where server-local midnight is 7-8h off Vancouver
// midnight. These helpers do wall-calendar math (DST-safe) and convert each
// wall day to epoch via vancouverMidnightEpoch.

export interface WallDay { year: number; month: number; day: number; }

/** Vancouver wall date for the given epoch (default now). */
export function vancouverTodayParts(ts: number = Math.floor(Date.now() / 1000)): WallDay {
  const p = getVancouverParts(ts);
  return { year: p.year, month: p.month, day: p.day };
}

/** Wall-calendar day arithmetic (DST-safe: operates on y/m/d, not epochs). */
export function addWallDays(w: WallDay, n: number): WallDay {
  const dt = new Date(Date.UTC(w.year, w.month - 1, w.day) + n * 86400000);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

export function wallDayIso(w: WallDay): string {
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** [start, end) epoch range covering exactly one Vancouver wall day. */
export function vancouverDayRange(w: WallDay): { start: number; end: number } {
  const start = vancouverMidnightEpoch(w.year, w.month, w.day);
  const nx = addWallDays(w, 1);
  return { start, end: vancouverMidnightEpoch(nx.year, nx.month, nx.day) };
}
