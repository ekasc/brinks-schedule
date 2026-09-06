import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listJobsSummary, listActiveUsers } from '$lib/server/db';
import { vancouverDayRange, vancouverTodayParts, wallDayIso } from '$lib/server/weekOffset';

/** Vancouver wall date — the server runs on UTC, and toISOString shifts evenings. */
function vancouverToday(): string {
  return wallDayIso(vancouverTodayParts());
}
/** Garbage ?date= falls back to today instead of querying NaN ranges. */
function parseDateParam(raw: string | null, fallback: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return fallback;
  return raw;
}
/** Epoch [start, end) for a Vancouver wall day — server-local midnight is off by 7-8h on UTC hosts. */
function dayRange(dateStr: string): { start: number; end: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return vancouverDayRange({ year: y, month: m, day: d });
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'admin') throw redirect(302, '/clients');

  // Technician: force own ID, ignore any tech query param
  if (locals.user.role === 'tech') {
    const techId = locals.user.id;
    const techs = [{ id: locals.user.id, display_name: locals.user.display_name }];
    const dateStr = parseDateParam(url.searchParams.get('date'), vancouverToday());
    const { start: dayStart, end: dayEnd } = dayRange(dateStr);
    const jobs = techId ? await listJobsSummary(dayStart, dayEnd, techId) : [];
    return { techs, techId, date: dateStr, jobs };
  }

  // When a tech is picked via ?tech=, both queries are independent — fire together.
  // Otherwise the tech list decides the default tech, so it stays sequential.
  const paramTech = Number(url.searchParams.get('tech')) || 0;
  // Active techs only — matches calendar/book scoping.
  const techsPromise = listActiveUsers('tech');
  const dateStr = parseDateParam(url.searchParams.get('date'), vancouverToday());

  const { start: dayStart, end: dayEnd } = dayRange(dateStr);
  const jobsPromise = paramTech ? listJobsSummary(dayStart, dayEnd, paramTech) : null;

  const techs = (await techsPromise)
    .filter((u) => u.role === 'tech')
    .map((t) => ({ id: t.id, display_name: t.display_name }));
  const techId = paramTech || (techs[0]?.id ?? 0);

  const jobs = jobsPromise ? await jobsPromise : techId ? await listJobsSummary(dayStart, dayEnd, techId) : [];
  return { techs, techId, date: dateStr, jobs };
};
