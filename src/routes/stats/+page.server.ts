import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTeamStats, getSystemStats, getIncomeForUser, listIncomeJobs } from '$lib/server/db';

function startOfWeek(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-x.getDay()); return x; }
function startOfMonth(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(1); return x; }

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  const period = url.searchParams.get('p') || 'all';
  const now = new Date();
  let fromTs: number | undefined, toTs: number | undefined;
  if (period === 'w') {
    fromTs = Math.floor(startOfWeek(now).getTime()/1000);
    toTs = fromTs + 7*86400;
  } else if (period === 'm') {
    fromTs = Math.floor(startOfMonth(now).getTime()/1000);
    const next = new Date(now); next.setMonth(next.getMonth()+1); next.setHours(0,0,0,0); next.setDate(1);
    toTs = Math.floor(next.getTime()/1000);
  }
  const system = await getSystemStats(fromTs, toTs);
  const team = await getTeamStats(fromTs, toTs);
  const me = await getIncomeForUser(locals.user.id, locals.user.role, fromTs, toTs);
  // also get raw job list for personal sparkline?
  const recent = await listIncomeJobs(locals.user.id, locals.user.role, 5);
  return { period, system, team, me, user: locals.user, recent };
};
