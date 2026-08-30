import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getJob, findUserById, setJobStatus, setJobCoords, setJobCompleted } from '$lib/server/db';

const ALL_STATUSES = ['sent','signed','cancelled'] as const;

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  const id = Number(params.id);
  const job = await getJob(id);
  if (!job) throw error(404, 'Job not found');
  const tech = await findUserById(job.tech_id);
  const booker = await findUserById(job.booked_by);
  // PII visibility: tech assigned to the job, the booker, and any admin see PII.
  // Other sales do not.
  const canSeePii = locals.user.role === 'admin'
    || (locals.user.role === 'tech' && locals.user.id === job.tech_id)
    || (locals.user.role === 'sales' && locals.user.id === job.booked_by);
  const canEdit = canSeePii; // same gate for now
  return {
    job,
    tech: tech ? { id: tech.id, display_name: tech.display_name, username: tech.username } : null,
    booker: booker ? { id: booker.id, display_name: booker.display_name } : null,
    canEdit,
    canSeePii
  };
};

export const actions: Actions = {
  status: async ({ request, params, locals }) => {
    if (!locals.user) return fail(403, { error: 'forbidden' });
    const id = Number(params.id);
    const job = await getJob(id);
    if (!job) return fail(404, { error: 'not found' });
    const canChange = locals.user.role === 'admin'
      || (locals.user.role === 'tech' && locals.user.id === job.tech_id)
      || (locals.user.role === 'sales' && locals.user.id === job.booked_by);
    if (!canChange) return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const status = String(data.get('status') || '');
    if (!ALL_STATUSES.includes(status as any)) return fail(400, { error: 'bad status' });
    await setJobStatus(id, status as any);
    return { ok: true };
  },
  coords: async ({ request, params, locals }) => {
    if (!locals.user) return fail(403, { error: 'forbidden' });
    const id = Number(params.id);
    const job = await getJob(id);
    if (!job) return fail(404, { error: 'not found' });
    const canEdit = locals.user.role === 'admin'
      || (locals.user.role === 'tech' && locals.user.id === job.tech_id)
      || (locals.user.role === 'sales' && locals.user.id === job.booked_by);
    if (!canEdit) return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const lat = Number(data.get('lat'));
    const lng = Number(data.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fail(400, { error: 'bad coords' });
    await setJobCoords(id, lat, lng);
    return { ok: true };
  },
  complete: async ({ request, params, locals }) => {
    if (!locals.user) return fail(403, { error: 'forbidden' });
    const id = Number(params.id);
    const job = await getJob(id);
    if (!job) return fail(404, { error: 'not found' });
    // anyone signed in can mark completion (tech, sales, or admin)
    const data = await request.formData();
    const completed = String(data.get('completed') || '0') === '1';
    await setJobCompleted(id, completed ? Math.floor(Date.now() / 1000) : null);
    return { ok: true };
  }
};
