import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { findUserById, listActiveUsers, listJobsSummary } from '$lib/server/db';
import { addWallDays, parseWeekOffset, vancouverDayRange, vancouverTodayParts, wallDayIso } from '$lib/server/weekOffset';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'admin') throw redirect(302, '/clients');
  const isTech = locals.user.role === 'tech';
  if (isTech) {
    const offsetWeeks = parseWeekOffset(url.searchParams.get('w'));
    // Rolling 7 Vancouver wall days from today, not Sun–Sat. Wall-calendar
    // math keeps day buckets exact across DST and on UTC hosts.
    const weekStart = addWallDays(vancouverTodayParts(), offsetWeeks * 7);
    const { start: startTs } = vancouverDayRange(weekStart);
    const { start: endTs } = vancouverDayRange(addWallDays(weekStart, 7));
    const techs = [{ id: locals.user.id, display_name: locals.user.display_name }];
    const weekJobs = (await listJobsSummary(startTs, endTs, locals.user.id)) as any[];
    const days: { iso: string; date: Date; techs: { techId: number; techName: string; jobs: typeof weekJobs }[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const wall = addWallDays(weekStart, i);
      const { start: dayStart, end: dayEnd } = vancouverDayRange(wall);
      const date = new Date(dayStart * 1000);
      days.push({
        iso: wallDayIso(wall),
        date,
        techs: techs.map((t) => {
          const jobs = weekJobs.filter((j) => j.tech_id === t.id && j.status !== 'cancelled' && j.status !== 'declined' && j.starts_at < dayEnd && j.ends_at > dayStart).sort((a, b) => a.starts_at - b.starts_at);
          return { techId: t.id, techName: t.display_name, jobs };
        })
      });
    }
    return { techs, days, weekStartIso: wallDayIso(weekStart), offsetWeeks, todayIso: wallDayIso(vancouverTodayParts()) };
  }

  const activeTechsPromise = listActiveUsers('tech');
  const offsetWeeks = parseWeekOffset(url.searchParams.get('w'));
  const weekStart = addWallDays(vancouverTodayParts(), offsetWeeks * 7);
  const { start: startTs } = vancouverDayRange(weekStart);
  const { start: endTs } = vancouverDayRange(addWallDays(weekStart, 7));

  // Independent queries — one round trip instead of two.
  const [activeTechs, weekJobs] = await Promise.all([
    activeTechsPromise,
    listJobsSummary(startTs, endTs) as Promise<any[]>
  ]);
  const activeIds = new Set(activeTechs.map((t) => t.id));
  const extraTechIds = [...new Set(weekJobs.filter((j) => j.status !== 'cancelled' && j.status !== 'declined').map((j) => j.tech_id as number))].filter((id) => !activeIds.has(id));
  const extraTechs = (
    await Promise.all(extraTechIds.map((id) => findUserById(id)))
  ).filter((u): u is NonNullable<typeof u> => !!u);
  const techs = [...activeTechs, ...extraTechs].sort((a, b) => a.display_name.localeCompare(b.display_name));

  const days: { iso: string; date: Date; techs: { techId: number; techName: string; jobs: typeof weekJobs }[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const wall = addWallDays(weekStart, i);
    const { start: dayStart, end: dayEnd } = vancouverDayRange(wall);
    const date = new Date(dayStart * 1000);
    days.push({
      iso: wallDayIso(wall),
      date,
      techs: techs.map((t) => {
        const jobs = weekJobs.filter((j) => j.tech_id === t.id && j.status !== 'cancelled' && j.status !== 'declined' && j.starts_at < dayEnd && j.ends_at > dayStart).sort((a, b) => a.starts_at - b.starts_at);
        return { techId: t.id, techName: t.display_name, jobs };
      })
    });
  }
  return {
    techs: techs.map(t => ({ id: t.id, display_name: t.display_name })),
    days,
    weekStartIso: wallDayIso(weekStart),
    offsetWeeks,
    todayIso: wallDayIso(vancouverTodayParts())
  };
};
