import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listJobs, listUsers } from '$lib/server/db';
import { sanitizeJobs } from '$lib/server/jobAccess';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'admin') throw redirect(302, '/clients');

  // Technician: force own ID, ignore any tech query param
  if (locals.user.role === 'tech') {
    const techId = locals.user.id;
    const techs = [{ id: locals.user.id, display_name: locals.user.display_name }];
    const dateStr = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const [y, m, d] = dateStr.split('-').map(Number);
    const dayStart = Math.floor(new Date(y, m - 1, d, 0, 0, 0, 0).getTime() / 1000);
    const nextDay = new Date(y, m - 1, d, 0, 0, 0, 0); nextDay.setDate(nextDay.getDate() + 1);
    const dayEnd = Math.floor(nextDay.getTime() / 1000);
    const rawJobs = techId ? await listJobs(dayStart, dayEnd, techId) : [];
    const jobs = sanitizeJobs(rawJobs as any, locals.user);
    return { techs, techId, date: dateStr, jobs };
  }

  const techs = (await listUsers()).filter((u) => u.role === 'tech');
  const techId = Number(url.searchParams.get('tech')) || (techs[0]?.id ?? 0);
  const dateStr = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const [y, m, d] = dateStr.split('-').map(Number);
  const dayStart = Math.floor(new Date(y, m - 1, d, 0, 0, 0, 0).getTime() / 1000);
  const nextDay = new Date(y, m - 1, d, 0, 0, 0, 0); nextDay.setDate(nextDay.getDate() + 1);
  const dayEnd = Math.floor(nextDay.getTime() / 1000);

  const rawJobs = techId ? await listJobs(dayStart, dayEnd, techId) : [];
  const jobs = sanitizeJobs(rawJobs as any, locals.user);
  return { techs, techId, date: dateStr, jobs };
};
