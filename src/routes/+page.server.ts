import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listJobsSummary, listActiveUsers } from '$lib/server/db';
import { addWallDays, vancouverDayRange, vancouverTodayParts } from '$lib/server/weekOffset';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    if (url.pathname === '/[fallback]') return { techs: [], upcoming: [], isTech: false, isSales: false };
    throw redirect(302, '/login');
  }
  // Admin is not allowed on dashboard; hooks will redirect to /clients
  if (locals.user.role === 'admin') throw redirect(302, '/clients');

  // Vancouver wall days — server-local midnight is off by 7-8h on UTC hosts.
  const today = vancouverTodayParts();
  const { start: todayStart } = vancouverDayRange(today);
  const { end: tomorrowEnd } = vancouverDayRange(addWallDays(today, 1));

  const isTech = locals.user.role === 'tech';
  let techs;
  let allJobs;
  if (isTech) {
    // technician only sees own jobs; only own card shown
    techs = [{ id: locals.user.id, display_name: locals.user.display_name, username: locals.user.username, role: 'tech' as const }];
    allJobs = await listJobsSummary(todayStart, tomorrowEnd, locals.user.id);
  } else {
    // Independent queries — one round trip instead of two.
    // Active techs only: departed techs get no dashboard cards.
    [techs, allJobs] = await Promise.all([
      listActiveUsers('tech'),
      listJobsSummary(todayStart, tomorrowEnd)
    ]);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const upcoming = allJobs
    .filter(j => j.status === 'signed' && j.ends_at > nowSec)
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
    isSales: !isTech
  };
};
