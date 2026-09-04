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

/** Local YYYY-MM-DD for tomorrow (DST-safe). */
export function localIsoTomorrow(d: Date = new Date()): string {
  const t = new Date(d);
  t.setDate(t.getDate() + 1);
  return localIsoDay(t);
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
