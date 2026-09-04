import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
  getJobSummary,
  getJobPrivate,
  findUserById,
  listActiveUsers,
  updateJob,
  deleteJob,
  setJobCoords,
  vancouverWallToEpoch,
  getVancouverParts
} from '$lib/server/db';
import { assertJobLoadAccess, canViewJob, canChangeJobStatus } from '$lib/server/jobAccess';
import { geocode } from '$lib/server/geocode';
import { notifyJobEdited, notifyUser } from '$lib/server/notifications';

const DURATIONS = [60, 90, 120];

function str(v: FormDataEntryValue | null): string {
  return v == null ? '' : String(v).trim();
}
function opt(v: string | null): string | null {
  return v == null || v === '' ? null : v;
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function parseDateInput(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { y, m: mo, d };
}
function parseTimeInput(s: string): { h: number; min: number } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

/** True when the submitted values match the stored job — skips write + notify. */
function isNoopEdit(before: any, v: Record<string, any>): boolean {
  if (v.tech_id !== before.tech_id || v.starts_at !== before.starts_at || v.ends_at !== before.ends_at)
    return false;
  if (v.price_cents !== (before.price_cents ?? 0)) return false;
  for (const k of ['client_name', 'address', 'street', 'city', 'province', 'postal_code']) {
    if ((v[k] ?? null) !== (before[k] ?? null)) return false;
  }
  for (const k of [
    'email', 'phone', 'dob', 'telus_pin', 'id_type', 'id_last4', 'emergency_name',
    'emergency_number', 'emergency_relation', 'verbal_password', 'svc_internet_detail',
    'svc_home_phone_detail', 'svc_tv_detail', 'security_offered', 'notes'
  ]) {
    if ((v[k] ?? null) !== (before[k] ?? null)) return false;
  }
  for (const k of ['svc_internet', 'svc_home_phone', 'svc_tv']) {
    if (!!v[k] !== (Number(before[k]) === 1)) return false;
  }
  return true;
}

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'admin') throw redirect(302, '/clients');
  const id = Number(params.id);
  const summary = await getJobSummary(id);
  assertJobLoadAccess(locals.user, summary);
  if (!canChangeJobStatus(locals.user, summary)) throw error(403, 'Forbidden');
  const isTech = locals.user.role === 'tech';
  // Independent lookups — one round trip instead of two.
  const [priv, activeTechs] = await Promise.all([
    getJobPrivate(id),
    isTech ? Promise.resolve(null) : listActiveUsers('tech')
  ]);
  const job = (priv ?? summary) as any;
  const techs = isTech
    ? [{ id: locals.user.id, display_name: locals.user.display_name }]
    : (activeTechs ?? []).map((t) => ({ id: t.id, display_name: t.display_name }));
  const parts = getVancouverParts(job.starts_at);
  const durationMin = Math.round((job.ends_at - job.starts_at) / 60);
  return {
    job,
    techs,
    isTech,
    dateIso: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    startTime: `${pad(parts.hour % 24)}:${pad(parts.minute)}`,
    durationMin
  };
};

export const actions: Actions = {
  save: async ({ request, params, locals }) => {
    if (!locals.user) return fail(403, { error: 'forbidden' });
    const id = Number(params.id);
    const existing = await getJobSummary(id);
    if (!existing) return fail(404, { error: 'not found' });
    if (!canViewJob(locals.user, existing)) return fail(403, { error: 'forbidden' });
    if (!canChangeJobStatus(locals.user, existing)) return fail(403, { error: 'forbidden' });
    const data = await request.formData();

    const client_name = str(data.get('client_name'));
    const street = str(data.get('street'));
    const city = str(data.get('city'));
    const province = str(data.get('province')).toUpperCase();
    const postal_code = str(data.get('postal_code')).toUpperCase();
    if (client_name.length < 2) return fail(400, { error: 'Full name needs at least 2 characters.' });
    if (street.length < 2) return fail(400, { error: 'Street is required.' });
    if (city.length < 2) return fail(400, { error: 'City is required.' });
    if (!/^[A-Z]{2}$/.test(province)) return fail(400, { error: 'Use 2-letter province, e.g. BC.' });
    if (!/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/.test(postal_code))
      return fail(400, { error: 'Enter a valid Canadian postal code, e.g. V6A 1A1.' });
    const email = str(data.get('email'));
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return fail(400, { error: 'That email doesn’t look right.' });
    const telus_pin = str(data.get('telus_pin'));
    if (telus_pin && !/^(\d{4})(\s*,\s*\d{4}){0,9}$/.test(telus_pin))
      return fail(400, { error: 'Each TELUS PIN must be 4 digits.' });
    const id_last4 = str(data.get('id_last4'));
    if (id_last4 && !/^.{4}$/.test(id_last4))
      return fail(400, { error: 'Last 4 of ID needs exactly 4 characters.' });
    const id_type = str(data.get('id_type'));
    if (id_type && !['dl', 'passport', 'bcid', 'other'].includes(id_type))
      return fail(400, { error: 'Invalid ID type.' });
    const phone = str(data.get('phone'));
    if (phone && !/^[+()\d\s-]{7,}$/.test(phone))
      return fail(400, { error: 'Enter a valid phone number.' });
    const priceRaw = str(data.get('price'));
    let price_cents = 0;
    if (priceRaw) {
      const n = Number(priceRaw);
      if (!Number.isFinite(n) || n < 0) return fail(400, { error: 'Price must be a non-negative number.' });
      price_cents = Math.round(n * 100);
    }
    const dobRaw = str(data.get('dob'));
    if (dobRaw && Number.isNaN(new Date(dobRaw).getTime()))
      return fail(400, { error: 'Date of birth isn’t valid.' });
    // Fetch the stored row first: needed for the no-op check below, and to
    // protect a legacy non-ISO dob (which a date input can't represent) from
    // being wiped by an untouched save.
    const before = await getJobPrivate(id);
    const dob =
      dobRaw === '' && before?.dob && !/^\d{4}-\d{2}-\d{2}$/.test(before.dob) ? before.dob : opt(dobRaw);

    const date = parseDateInput(str(data.get('date')));
    const start = parseTimeInput(str(data.get('start')));
    const durationMin = Number(str(data.get('duration')));
    if (!date || !start || !DURATIONS.includes(durationMin))
      return fail(400, { error: 'Pick a valid date, start time and length.' });
    const starts_at = vancouverWallToEpoch(date.y, date.m, date.d, start.h, start.min);
    const ends_at = starts_at + durationMin * 60;

    let tech_id = existing.tech_id;
    if (locals.user.role !== 'tech') {
      tech_id = Number(data.get('tech_id'));
      if (!Number.isSafeInteger(tech_id) || tech_id < 1) return fail(400, { error: 'Choose a technician.' });
      const target = await findUserById(tech_id);
      if (!target || target.role !== 'tech' || target.is_active !== 1)
        return fail(400, { error: 'That technician is not available.' });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const scheduleChanged =
      tech_id !== existing.tech_id || starts_at !== existing.starts_at || ends_at !== existing.ends_at;
    if (existing.completed_at != null && scheduleChanged)
      return fail(400, { error: 'This install is marked complete — reopen it before moving it.' });
    if (scheduleChanged && ends_at <= nowSec)
      return fail(400, { error: 'Pick a future time — that slot has already passed.' });

    // Server composes the canonical address (same as /book) and geocodes it.
    const canonicalAddress = [street, city, province, postal_code]
      .filter(Boolean)
      .join(', ')
      .replace(/, ([A-Z]\d[A-Za-z][ -]?\d[A-Za-z]\d)$/, ' $1');
    let lat: number | null = null;
    let lng: number | null = null;
    let coords = await geocode(canonicalAddress);
    if (!coords) coords = await geocode(canonicalAddress);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }

    const svc_internet = data.get('svc_internet') != null;
    const svc_home_phone = data.get('svc_home_phone') != null;
    const svc_tv = data.get('svc_tv') != null;
    // NOTE: themes has no form input (same as /book) — never touch it here,
    // otherwise every save would null it out.
    const values: Record<string, any> = {
      client_name,
      address: canonicalAddress,
      street,
      city,
      province,
      postal_code,
      email: opt(email),
      phone: opt(phone),
      dob: opt(dob),
      telus_pin: opt(telus_pin),
      id_type: opt(id_type),
      id_last4: opt(id_last4),
      emergency_name: opt(str(data.get('emergency_name'))),
      emergency_number: opt(str(data.get('emergency_number'))),
      emergency_relation: opt(str(data.get('emergency_relation'))),
      verbal_password: opt(str(data.get('verbal_password'))),
      svc_internet,
      svc_internet_detail: svc_internet ? opt(str(data.get('svc_internet_detail'))) : null,
      svc_home_phone,
      svc_home_phone_detail: svc_home_phone ? opt(str(data.get('svc_home_phone_detail'))) : null,
      svc_tv,
      svc_tv_detail: svc_tv ? opt(str(data.get('svc_tv_detail'))) : null,
      security_offered: opt(str(data.get('security_offered'))),
      notes: opt(str(data.get('notes'))),
      price_cents,
      tech_id,
      starts_at,
      ends_at
    };
    // No-op save: skip the write entirely so we don't bump updated_at,
    // log a phantom 'edited' event, or ping the tech for nothing.
    if (before && isNoopEdit(before, values)) throw redirect(303, `/jobs/${id}`);
    const patch: Record<string, any> = { ...values };
    // Only send scheduling fields when they actually changed — otherwise an
    // unrelated edit (e.g. fixing a typo) could trip availability/overlap
    // enforcement when hours changed since booking.
    if (tech_id === existing.tech_id) delete patch.tech_id;
    if (starts_at === existing.starts_at) delete patch.starts_at;
    if (ends_at === existing.ends_at) delete patch.ends_at;
    const res = await updateJob(id, patch, locals.user.id);
    if (res && 'conflict' in res) return fail(409, { error: res.conflict });
    await setJobCoords(id, lat, lng);
    const fresh = await getJobSummary(id);
    if (fresh) await notifyJobEdited(fresh as any, locals.user.id).catch(() => {});
    throw redirect(303, `/jobs/${id}`);
  },

  delete: async ({ params, locals }) => {
    if (!locals.user) return fail(403, { error: 'forbidden' });
    const id = Number(params.id);
    const job = await getJobSummary(id);
    if (!job) return fail(404, { error: 'not found' });
    if (!(locals.user.role === 'sales' && job.booked_by === locals.user.id))
      return fail(403, { error: 'Only the sales rep who booked this job can delete it.' });
    if (job.completed_at != null)
      return fail(400, { error: 'This install is marked complete — reopen it before deleting it.' });
    // Tell the tech before the row (and its link) is gone.
    await notifyUser(job.tech_id, 'Booking updated', `${job.client_name} was deleted.`, '/', `job:${id}:deleted`).catch(() => {});
    await deleteJob(id);
    throw redirect(303, '/');
  }
};
