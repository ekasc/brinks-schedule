import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listJobsSummary, listUsers, getVancouverParts } from '$lib/server/db';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
/** Vancouver wall date — the server runs on UTC, and toISOString shifts evenings. */
function vancouverToday(): string {
  const p = getVancouverParts(Math.floor(Date.now() / 1000));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
/** Garbage ?date= falls back to today instead of querying NaN ranges. */
function parseDateParam(raw: string | null, fallback: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return fallback;
  return raw;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'admin') throw redirect(302, '/clients');

  // Technician: force own ID, ignore any tech query param
  if (locals.user.role === 'tech') {
    const techId = locals.user.id;
    const techs = [{ id: locals.user.id, display_name: locals.user.display_name }];
    const dateStr = parseDateParam(url.searchParams.get('date'), vancouverToday());
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayStart = Math.floor(new Date(y, m - 1, d, 0, 0, 0, 0).getTime() / 1000);
    const nextDay = new Date(y, m - 1, d, 0, 0, 0, 0); nextDay.setDate(nextDay.getDate() + 1);
    const dayEnd = Math.floor(nextDay.getTime() / 1000);
    const jobs = techId ? await listJobsSummary(dayStart, dayEnd, techId) : [];
    return { techs, techId, date: dateStr, jobs };
  }

  // When a tech is picked via ?tech=, both queries are independent — fire together.
  // Otherwise the tech list decides the default tech, so it stays sequential.
  const paramTech = Number(url.searchParams.get('tech')) || 0;
  const techsPromise = listUsers();
  const dateStr = parseDateParam(url.searchParams.get('date'), vancouverToday());

  const [y, m, d] = dateStr.split('-').map(Number);
  const dayStart = Math.floor(new Date(y, m - 1, d, 0, 0, 0, 0).getTime() / 1000);
  const nextDay = new Date(y, m - 1, d, 0, 0, 0, 0); nextDay.setDate(nextDay.getDate() + 1);
  const dayEnd = Math.floor(nextDay.getTime() / 1000);
  const jobsPromise = paramTech ? listJobsSummary(dayStart, dayEnd, paramTech) : null;

  const techs = (await techsPromise).filter((u) => u.role === 'tech');
  const techId = paramTech || (techs[0]?.id ?? 0);

  const jobs = jobsPromise ? await jobsPromise : techId ? await listJobsSummary(dayStart, dayEnd, techId) : [];
  return { techs, techId, date: dateStr, jobs };
};
