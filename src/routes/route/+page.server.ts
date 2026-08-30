import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listJobs, listUsers } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');

  const techs = (await listUsers()).filter((u) => u.role === 'tech');
  const techId = Number(url.searchParams.get('tech')) || (locals.user.role === 'tech' ? locals.user.id : techs[0]?.id ?? 0);
  const dateStr = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const [y, m, d] = dateStr.split('-').map(Number);
  const dayStart = Math.floor(new Date(y, m - 1, d, 0, 0, 0, 0).getTime() / 1000);
  const dayEnd = dayStart + 86400;

  const jobs = techId ? await listJobs(dayStart, dayEnd, techId) : [];
  return { techs, techId, date: dateStr, jobs };
};
