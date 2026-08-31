import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms/server';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import { bookJobSchema } from '$lib/schemas/book';
import { listActiveUsers, createJob, getAvailableSlots, SLOT_HORIZON_DAYS } from '$lib/server/db';
import { geocode } from '$lib/server/geocode';
import { normalizeDuration, normalizeTechSelection } from '$lib/server/bookingSelection';
import { notifyJobCreated } from '$lib/server/notifications';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'tech') throw redirect(302, '/');
  const techs = await listActiveUsers('tech');
  const preselectTech = normalizeTechSelection(url.searchParams.get('tech'), techs.map((t) => t.id));
  const durationMin = normalizeDuration(url.searchParams.get('dur'));
  const allDurations = [60, 90, 120] as const;
  const slotsByTech: Record<number, { starts_at: number; ends_at: number }[]> = {};
  const slotsByTechByDuration: Record<number, Record<number, { starts_at: number; ends_at: number }[]>> = {};
  for (const t of techs) {
    slotsByTech[t.id] = await getAvailableSlots(t.id, { durationMin });
    slotsByTechByDuration[t.id] = {};
    for (const d of allDurations) slotsByTechByDuration[t.id][d] = await getAvailableSlots(t.id, { durationMin: d });
  }
  return {
    form: await superValidate(zod4(bookJobSchema as any)),
    techs: techs.map(t => ({ id: t.id, display_name: t.display_name })), slotsByTech, slotsByTechByDuration,
    preselectTech, preselectDate: url.searchParams.get('date') || '',
    preselectStart: url.searchParams.get('start') || '10:00', durationMin
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) return fail(403, { error: 'not logged in' });
    if (locals.user.role === 'tech') return fail(403, { error: 'tech cannot book' });
    const form = await superValidate(request, zod4(bookJobSchema as any));
    if (!form.valid) return fail(400, { form });
    const value = form.data as any;
    const startsAt = Math.floor(new Date(value.starts_at).getTime() / 1000);
    const endsAt = Math.floor(new Date(value.ends_at).getTime() / 1000);
    // Reproduce the slot using the actual selected duration; getAvailableSlots defaults to
    // 90-min slots, so a 60/120-min selection would never match and be wrongly rejected.
    const durationMin = Math.max(1, Math.round((endsAt - startsAt) / 60));
    const horizon = new Date(); horizon.setDate(horizon.getDate() + SLOT_HORIZON_DAYS);
    const available = await getAvailableSlots(value.tech_id, { fromTs: Math.floor(Date.now() / 1000), toTs: Math.floor(horizon.getTime() / 1000), durationMin });
    if (!available.some(s => s.starts_at === startsAt && s.ends_at === endsAt)) {
      return fail(409, { form, error: 'That time slot is no longer offered for this tech. Pick a different one below.' });
    }
    // Coordinates are best-effort and server-authoritative. Never trust client-supplied
    // lat/lng — invariant: lat/lng, if present, was derived from the current address
    // by the server in this request. Client coords are UI state only (preview).
    let lat: number | null = null;
    let lng: number | null = null;
    if (value.address?.trim()) {
      const coords = await geocode(value.address);
      if (coords) { lat = coords.lat; lng = coords.lng; }
    }
    const unmapped = lat == null || lng == null;
    const result = await createJob({ ...value, tech_id: value.tech_id, booked_by: locals.user.id,
      starts_at: startsAt, ends_at: endsAt,
      email: value.email || null, dob: value.dob || null, telus_pin: value.telus_pin || null,
      id_type: value.id_type || null, id_last4: value.id_last4 || null,
      emergency_name: value.emergency_name || null, emergency_number: value.emergency_number || null,
      emergency_relation: value.emergency_relation || null, verbal_password: value.verbal_password || null,
      svc_internet_detail: value.svc_internet ? (value.svc_internet_detail || null) : null,
      svc_home_phone_detail: value.svc_home_phone ? (value.svc_home_phone_detail || null) : null,
      svc_tv_detail: value.svc_tv ? (value.svc_tv_detail || null) : null,
      themes: value.themes || null, security_offered: value.security_offered || null, notes: value.notes || null,
      phone: value.phone || null, price_cents: Math.round((value.price || 0) * 100),
      lat: lat ?? null, lng: lng ?? null
    });
    if ('conflict' in result) return fail(409, { form, error: result.conflict === 'tech_busy' ? 'That tech is already booked at that time (or the slot was just taken).' : 'That time is outside the tech\'s posted availability. Add a block first or pick a different time.' });
    await notifyJobCreated({ id: result.id, tech_id: value.tech_id, client_name: value.client_name, starts_at: startsAt }).catch(()=>{});
    throw redirect(303, `/jobs/${result.id}${unmapped ? '?unmapped=1' : ''}`);
  }
};
