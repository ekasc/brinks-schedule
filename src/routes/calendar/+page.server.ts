import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { findUserById, listActiveUsers, listJobs } from '$lib/server/db';
import { parseWeekOffset } from '$lib/server/weekOffset';

function startOfWeek(d: Date): Date {
  const x = new Date(d); x.setHours(0,0,0,0);
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  return x;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'admin') throw redirect(302, '/clients');
  const isTech = locals.user.role === 'tech';
  if (isTech) {
    const offsetWeeks = parseWeekOffset(url.searchParams.get('w'));
    const base = startOfWeek(new Date());
    base.setDate(base.getDate() + offsetWeeks * 7);
    const startTs = Math.floor(base.getTime() / 1000);
    const endDate = new Date(base); endDate.setDate(endDate.getDate() + 7);
    const endTs = Math.floor(endDate.getTime() / 1000);
    const techs = [{ id: locals.user.id, display_name: locals.user.display_name }];
    const weekJobs = (await listJobs(startTs, endTs, locals.user.id)) as any[];
    const days: { iso: string; date: Date; techs: { techId: number; techName: string; jobs: typeof weekJobs }[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const dayStart = Math.floor(d.getTime() / 1000);
      const dayEnd = Math.floor(next.getTime() / 1000);
      days.push({
        iso: d.toISOString().slice(0, 10),
        date: d,
        techs: techs.map((t) => {
          const jobs = weekJobs.filter((j) => j.tech_id === t.id && j.status !== 'cancelled' && j.starts_at < dayEnd && j.ends_at > dayStart).sort((a, b) => a.starts_at - b.starts_at);
          return { techId: t.id, techName: t.display_name, jobs };
        })
      });
    }
    return { techs, days, weekStartIso: base.toISOString(), offsetWeeks };
  }

  const activeTechs = await listActiveUsers('tech');
  const offsetWeeks = parseWeekOffset(url.searchParams.get('w'));
  const base = startOfWeek(new Date());
  base.setDate(base.getDate() + offsetWeeks * 7);
  const startTs = Math.floor(base.getTime() / 1000);
  const endDate = new Date(base); endDate.setDate(endDate.getDate() + 7);
  const endTs = Math.floor(endDate.getTime() / 1000);

  const weekJobs = (await listJobs(startTs, endTs)) as any[];
  const activeIds = new Set(activeTechs.map((t) => t.id));
  const extraTechIds = [...new Set(weekJobs.filter((j) => j.status !== 'cancelled').map((j) => j.tech_id as number))].filter((id) => !activeIds.has(id));
  const extraTechs = (
    await Promise.all(extraTechIds.map((id) => findUserById(id)))
  ).filter((u): u is NonNullable<typeof u> => !!u);
  const techs = [...activeTechs, ...extraTechs].sort((a, b) => a.display_name.localeCompare(b.display_name));

  const days: { iso: string; date: Date; techs: { techId: number; techName: string; jobs: typeof weekJobs }[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base); d.setDate(d.getDate() + i);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dayStart = Math.floor(d.getTime() / 1000);
    const dayEnd = Math.floor(next.getTime() / 1000);
    days.push({
      iso: d.toISOString().slice(0, 10),
      date: d,
      techs: techs.map((t) => {
        const jobs = weekJobs.filter((j) => j.tech_id === t.id && j.status !== 'cancelled' && j.starts_at < dayEnd && j.ends_at > dayStart).sort((a, b) => a.starts_at - b.starts_at);
        return { techId: t.id, techName: t.display_name, jobs };
      })
    });
  }
  return {
    techs: techs.map(t => ({ id: t.id, display_name: t.display_name })),
    days,
    weekStartIso: base.toISOString(),
    offsetWeeks
  };
};
