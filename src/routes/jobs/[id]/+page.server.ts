import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getJobSummary, getJobPrivate, findUserById, setJobStatus, setJobCompleted, logPiiAccess } from '$lib/server/db';
import { assertJobLoadAccess, canViewJob, canChangeJobStatus, canChangeJobCompletion } from '$lib/server/jobAccess';
import { reconcileNotifications } from '$lib/server/notifications';

const ALL_STATUSES = ['sent','signed','cancelled','declined'] as const;

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'admin') throw redirect(302, '/clients');
  const id = Number(params.id);
  const summary = await getJobSummary(id);
  assertJobLoadAccess(locals.user, summary);
  const canSeePii = canChangeJobStatus(locals.user, summary);
  // Audit trail: the pii_access_log table exists for this — a view that
  // includes decrypted PII counts as access.
  // Independent lookups — one round trip instead of three.
  const [priv, tech, booker] = await Promise.all([
    canSeePii ? getJobPrivate(id) : Promise.resolve(null),
    findUserById(summary.tech_id),
    findUserById(summary.booked_by)
  ]);
  const job = (priv ?? summary) as any;
  if (canSeePii) await logPiiAccess(id, locals.user.id).catch(() => {});
  const canEdit = canSeePii;
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
    const job = await getJobSummary(id);
    if (!job) return fail(404, { error: 'not found' });
    if (!canViewJob(locals.user, job)) return fail(403, { error: 'forbidden' });
    if (!canChangeJobStatus(locals.user, job)) return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const status = String(data.get('status') || '');
    if (!ALL_STATUSES.includes(status as any)) return fail(400, { error: 'bad status' });
    const res = await setJobStatus(id, status as any, locals.user.id);
    if (res && 'conflict' in res) return fail(409, { error: res.conflict });
    // Reconcile only (prompt in-app row). Push delivery is the cron's job —
    // awaiting pumpPush here blocked the tap on push-network latency.
    await reconcileNotifications().catch(()=>{});
    return { ok: true };
  },
  complete: async ({ request, params, locals }) => {
    if (!locals.user) return fail(403, { error: 'forbidden' });
    const id = Number(params.id);
    const job = await getJobSummary(id);
    if (!job) return fail(404, { error: 'not found' });
    if (!canViewJob(locals.user, job)) return fail(403, { error: 'forbidden' });
    if (!canChangeJobCompletion(locals.user, job)) return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const completed = String(data.get('completed') || '0') === '1';
    const res = await setJobCompleted(id, completed ? Math.floor(Date.now() / 1000) : null, locals.user.id);
    if (res && 'conflict' in res) return fail(409, { error: res.conflict });
    await reconcileNotifications().catch(()=>{});
    return { ok: true };
  }
};
