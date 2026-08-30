import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listJobs, listUsers, listAvailability } from '$lib/server/db';
import { travelMinutes } from '$lib/server/geo';

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date): Date { const x = new Date(d); x.setHours(23,59,59,999); return x; }

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    // Build-time SPA fallback fetch: render a public shell instead of redirecting.
    if (url.pathname === '/[fallback]') return { techs: [], upcoming: [], isTech: false, isSales: false, myTechId: null };
    throw redirect(302, '/login');
  }
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowEnd = new Date(todayEnd); tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const techs = await listUsers('tech');
  const allJobs = await listJobs(todayStart.getTime() / 1000, tomorrowEnd.getTime() / 1000);

  // group by tech for "next up" view
  const myTechId = locals.user.role === 'tech' ? locals.user.id : null;
  const upcoming = allJobs
    .filter(j => j.status === 'signed' && j.ends_at > Math.floor(now.getTime() / 1000))
    .sort((a, b) => a.starts_at - b.starts_at)
    .slice(0, 20)
    .map(j => {
      const tech = techs.find(t => t.id === j.tech_id);
      return { ...j, tech_name: tech?.display_name || '?' };
    });

  return {
    techs,
    upcoming,
    isTech: locals.user.role === 'tech',
    isSales: locals.user.role === 'sales' || locals.user.role === 'admin',
    myTechId
  };
};
