export function getTodayHeading(isTech: boolean, count: number): string {
  return isTech ? `Your jobs · ${count}` : `Today · ${count} total`;
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
