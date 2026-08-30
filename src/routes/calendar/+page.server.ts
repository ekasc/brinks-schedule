import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listJobs, listUsers } from '$lib/server/db';
import { travelMinutes, isTight } from '$lib/server/geo';

function startOfWeek(d: Date): Date {
  const x = new Date(d); x.setHours(0,0,0,0);
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  return x;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  const techs = await listUsers('tech');
  const offsetWeeks = Number(url.searchParams.get('w') || '0');
  const base = startOfWeek(new Date());
  base.setDate(base.getDate() + offsetWeeks * 7);
  const startTs = Math.floor(base.getTime() / 1000);
  const endTs = startTs + 7 * 86400;

  // for each tech: list of {job, driveFromPrev}
  const days: { iso: string; date: Date; techs: { techId: number; techName: string; jobs: any[] }[] }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base); d.setDate(d.getDate() + i);
    const dayStart = Math.floor(d.getTime() / 1000);
    const dayEnd = dayStart + 86400;
    days.push({
      iso: d.toISOString().slice(0, 10),
      date: d,
      techs: await Promise.all(techs.map(async (t) => {
        const jobs = (await listJobs(dayStart, dayEnd, t.id)).sort((a, b) => a.starts_at - b.starts_at);
        return { techId: t.id, techName: t.display_name, jobs };
      }))
    });
  }
  return {
    techs: techs.map(t => ({ id: t.id, display_name: t.display_name })),
    days,
    weekStartIso: base.toISOString(),
    offsetWeeks
  };
};
