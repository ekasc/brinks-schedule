import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listAvailability, listJobs, listUsers, addAvailability, removeAvailability } from '$lib/server/db';

function startOfWeek(d: Date): Date {
  const x = new Date(d); x.setHours(0,0,0,0);
  const dow = x.getDay(); // 0 sun .. 6 sat
  x.setDate(x.getDate() - dow);
  return x;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  // sales+admin see all techs; tech sees their own calendar
  const techs = (locals.user.role === 'tech') ? [locals.user] : await listUsers('tech');
  const offsetWeeks = Number(url.searchParams.get('w') || '0');
  const base = startOfWeek(new Date());
  base.setDate(base.getDate() + offsetWeeks * 7);
  const startTs = Math.floor(base.getTime() / 1000);
  const endTs = startTs + 7 * 86400;

  const blocksByTech: Record<number, any[]> = {};
  const jobsByTech: Record<number, any[]> = {};
  for (const t of techs) {
    blocksByTech[t.id] = await listAvailability(t.id, startTs, endTs);
    jobsByTech[t.id] = await listJobs(startTs, endTs, t.id);
  }

  return {
    techs: techs.map(t => ({ id: t.id, display_name: t.display_name })),
    weekStartIso: base.toISOString(),
    offsetWeeks,
    blocksByTech,
    jobsByTech
  };
};

export const actions: Actions = {
  add: async ({ request, locals }) => {
    if (!locals.user || locals.user.role === 'sales') return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const techId = Number(data.get('tech_id') || (locals.user.role === 'tech' ? locals.user.id : 0));
    const date = String(data.get('date') || '');
    const start = String(data.get('start') || '');
    const end = String(data.get('end') || '');
    const note = String(data.get('note') || '').trim() || null;
    if (!techId || !date || !start || !end) return fail(400, { error: 'missing fields' });
    const startsAt = Math.floor(new Date(`${date}T${start}`).getTime() / 1000);
    const endsAt = Math.floor(new Date(`${date}T${end}`).getTime() / 1000);
    if (!(endsAt > startsAt)) return fail(400, { error: 'end must be after start' });
    // only the tech themselves or admin can add for a tech
    if (locals.user.role === 'tech' && techId !== locals.user.id) return fail(403, { error: 'forbidden' });
    await addAvailability(techId, startsAt, endsAt, note);
    return { ok: true };
  },
  remove: async ({ request, locals }) => {
    if (!locals.user) return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const id = Number(data.get('id') || 0);
    const techId = Number(data.get('tech_id') || 0);
    if (locals.user.role === 'tech' && techId !== locals.user.id) return fail(403, { error: 'forbidden' });
    if (locals.user.role === 'sales') return fail(403, { error: 'forbidden' });
    await removeAvailability(id, techId);
    return { ok: true };
  }
};
