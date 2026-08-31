import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listJobsSummary, listUsers } from '$lib/server/db';

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23,59,59,999); return x; }

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    if (url.pathname === '/[fallback]') return { techs: [], upcoming: [], isTech: false, isSales: false, myTechId: null };
    throw redirect(302, '/login');
  }
  // Admin is not allowed on dashboard; hooks will redirect to /clients
  if (locals.user.role === 'admin') throw redirect(302, '/clients');

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const isTech = locals.user.role === 'tech';
  let techs;
  let allJobs;
  if (isTech) {
    // technician only sees own jobs; only own card shown
    techs = [{ id: locals.user.id, display_name: locals.user.display_name, username: locals.user.username, role: 'tech' as const }];
    allJobs = await listJobsSummary(todayStart.getTime() / 1000, tomorrowEnd.getTime() / 1000, locals.user.id);
  } else {
    techs = await listUsers('tech');
    allJobs = await listJobsSummary(todayStart.getTime() / 1000, tomorrowEnd.getTime() / 1000);
  }

  const myTechId = isTech ? locals.user.id : null;
  const upcoming = allJobs
    .filter(j => j.status === 'signed' && j.ends_at > Math.floor(now.getTime() / 1000))
    .sort((a, b) => a.starts_at - b.starts_at)
    .slice(0, 20)
    .map(j => {
      const tech = techs.find(t => t.id === j.tech_id);
      return { ...j, tech_name: tech?.display_name || (j as any).tech_name || '?' };
    });

  return {
    techs,
    upcoming,
    isTech,
    isSales: locals.user.role === 'sales' || locals.user.role === 'admin',
    myTechId
  };
};
