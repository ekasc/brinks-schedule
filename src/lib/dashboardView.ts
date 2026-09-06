export function getTodayHeading(isTech: boolean, count: number): string {
  return isTech ? `Your jobs · ${count}` : `Today · ${count} total`;
}

/**
 * Local YYYY-MM-DD for the given date (default now). Never use
 * `toISOString().slice(0, 10)` for wall dates — UTC shifts the day in GMT-X
 * evenings (in Vancouver, "today" becomes tomorrow after 4–5pm).
 */
export function localIsoDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Vancouver wall YYYY-MM-DD for the given instant (default now). Day labels
 * must use the business timezone, not the browser's — the server buckets by
 * Vancouver wall days, so a browser behind Vancouver would mislabel edges. */
export function vancouverIsoDay(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const m = new Map(parts.map((p) => [p.type, p.value]));
  return `${m.get('year')}-${m.get('month')}-${m.get('day')}`;
}

/** Local YYYY-MM-DD for tomorrow (DST-safe). */
export function localIsoTomorrow(d: Date = new Date()): string {
  const t = new Date(d);
  t.setDate(t.getDate() + 1);
  return localIsoDay(t);
}

export const BUSINESS_TZ = 'America/Vancouver';

/** Vancouver wall YYYY-MM-DD for the day after the given instant (wall math, DST-safe). */
export function vancouverIsoTomorrow(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const m = new Map(parts.map((p) => [p.type, p.value]));
  const next = new Date(Date.UTC(Number(m.get('year')), Number(m.get('month')) - 1, Number(m.get('day')) + 1));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${p(next.getUTCMonth() + 1)}-${p(next.getUTCDate())}`;
}

/** Time-of-day label in the business timezone — never browser-local. */
export function fmtVancouverTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: BUSINESS_TZ });
}

/** Day label in the business timezone — never browser-local. */
export function fmtVancouverDay(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: BUSINESS_TZ });
}

export function shouldShowTechCards(isTech: boolean): boolean {
  return !isTech;
}

export function shouldShowTechsBusy(isTech: boolean): boolean {
  return !isTech;
}

export function shouldShowExportLink(role: string | null | undefined): boolean {
  return role === 'admin';
}
