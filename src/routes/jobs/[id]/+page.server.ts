import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getJob, findUserById, setJobStatus, setJobCompleted } from '$lib/server/db';
import { assertJobLoadAccess, canViewJob, canChangeJobStatus, canChangeJobCompletion, sanitizeJob } from '$lib/server/jobAccess';
import { reconcileAndDeliver } from '$lib/server/notifications';

const ALL_STATUSES = ['sent','signed','cancelled'] as const;

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'admin') throw redirect(302, '/clients');
  const id = Number(params.id);
  const job = await getJob(id);
  assertJobLoadAccess(locals.user, job);
  const tech = await findUserById(job.tech_id);
  const booker = await findUserById(job.booked_by);
  // Single source for PII/edit — preserves current effective behavior (admin never reaches here, tech own, sales own-booked).
  const canSeePii = canChangeJobStatus(locals.user, job);
  const canEdit = canSeePii;
  const jobDto = sanitizeJob(job as any, locals.user);
  return {
    job: jobDto,
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
    if (!canViewJob(locals.user, job)) return fail(403, { error: 'forbidden' });
    if (!canChangeJobStatus(locals.user, job)) return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const status = String(data.get('status') || '');
    if (!ALL_STATUSES.includes(status as any)) return fail(400, { error: 'bad status' });
    const res = await setJobStatus(id, status as any, locals.user.id);
    if (res && 'conflict' in res) return fail(409, { error: res.conflict });
    await reconcileAndDeliver().catch(()=>{});
    return { ok: true };
  },
  complete: async ({ request, params, locals }) => {
    if (!locals.user) return fail(403, { error: 'forbidden' });
    const id = Number(params.id);
    const job = await getJob(id);
    if (!job) return fail(404, { error: 'not found' });
    if (!canViewJob(locals.user, job)) return fail(403, { error: 'forbidden' });
    if (!canChangeJobCompletion(locals.user, job)) return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const completed = String(data.get('completed') || '0') === '1';
    await setJobCompleted(id, completed ? Math.floor(Date.now() / 1000) : null, locals.user.id);
    await reconcileAndDeliver().catch(()=>{});
    return { ok: true };
  }
};
