import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listUsers, createJob, getAvailableSlots } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'tech') throw redirect(302, '/');
  const techs = listUsers('tech');

  const preselectTech = Number(url.searchParams.get('tech') || techs[0]?.id || 0);
  const preselectDate = url.searchParams.get('date') || '';
  const preselectStart = url.searchParams.get('start') || '10:00';
  const durationMin = Number(url.searchParams.get('dur') || '90');

  const slotsByTech: Record<number, { starts_at: number; ends_at: number }[]> = {};
  for (const t of techs) {
    slotsByTech[t.id] = getAvailableSlots(t.id, { durationMin });
  }

  return {
    techs: techs.map(t => ({ id: t.id, display_name: t.display_name })),
    slotsByTech,
    preselectTech,
    preselectDate,
    preselectStart,
    durationMin
  };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) return fail(403, { error: 'not logged in' });
    if (locals.user.role === 'tech') return fail(403, { error: 'tech cannot book' });
    const data = await request.formData();
    const techId = Number(data.get('tech_id') || 0);
    const clientName = String(data.get('client_name') || '').trim();
    const address = String(data.get('address') || '').trim();
    const startsAt = Math.floor(new Date(String(data.get('starts_at') || '')).getTime() / 1000);
    const endsAt = Math.floor(new Date(String(data.get('ends_at') || '')).getTime() / 1000);
    const notes = String(data.get('notes') || '').trim() || null;

    // helpers to round-trip values back to the form on a fail
    const echo = {
      client_name: clientName,
      address,
      email: String(data.get('email') || '').trim(),
      dob: String(data.get('dob') || '').trim(),
      telus_pin: String(data.get('telus_pin') || '').trim(),
      id_type: String(data.get('id_type') || '').trim(),
      id_last4: String(data.get('id_last4') || '').trim(),
      emergency_name: String(data.get('emergency_name') || '').trim(),
      emergency_number: String(data.get('emergency_number') || '').trim(),
      emergency_relation: String(data.get('emergency_relation') || '').trim(),
      verbal_password: String(data.get('verbal_password') || '').trim(),
      svc_internet: data.get('svc_internet') === 'on',
      svc_home_phone: data.get('svc_home_phone') === 'on',
      svc_tv: data.get('svc_tv') === 'on',
      themes: String(data.get('themes') || '').trim(),
      security_offered: String(data.get('security_offered') || '').trim(),
      notes: notes ?? '',
      starts_at: String(data.get('starts_at') || ''),
      tech_id: techId
    };

    if (!techId || !clientName || !address || !startsAt || !endsAt || !(endsAt > startsAt)) {
      return fail(400, { error: 'Fill in client, address, and pick a time slot.', ...echo });
    }

    // Sanity: the picked slot should be one we offered in the smart picker.
    // If sales is trying to book a time that doesn't intersect any availability
    // block (e.g. they typed the URL directly, or the picker is out of sync),
    // show a friendlier error and let them pick from the visible slots.
    const fromTs = Math.floor(Date.now() / 1000);
    const toTs = fromTs + 14 * 86400;
    const available = getAvailableSlots(techId, { fromTs, toTs });
    const matches = available.some(s => s.starts_at === startsAt && s.ends_at === endsAt);
    if (!matches) {
      return fail(409, {
        error: 'That time slot is no longer offered for this tech. Pick a different one below.',
        ...echo
      });
    }

    const result = createJob({
      tech_id: techId,
      booked_by: locals.user.id,
      client_name: clientName,
      address,
      starts_at: startsAt,
      ends_at: endsAt,
      notes,
      email: String(data.get('email') || '').trim() || null,
      dob: String(data.get('dob') || '').trim() || null,
      telus_pin: String(data.get('telus_pin') || '').trim() || null,
      id_type: (String(data.get('id_type') || '').trim() || null) as 'dl'|'passport'|'bcid'|'other'|null,
      id_last4: String(data.get('id_last4') || '').trim() || null,
      emergency_name: String(data.get('emergency_name') || '').trim() || null,
      emergency_number: String(data.get('emergency_number') || '').trim() || null,
      emergency_relation: String(data.get('emergency_relation') || '').trim() || null,
      verbal_password: String(data.get('verbal_password') || '').trim() || null,
      svc_internet: data.get('svc_internet') === 'on',
      svc_home_phone: data.get('svc_home_phone') === 'on',
      svc_tv: data.get('svc_tv') === 'on',
      themes: String(data.get('themes') || '').trim() || null,
      security_offered: String(data.get('security_offered') || '').trim() || null
    });
    if ('conflict' in result) {
      return fail(409, {
        error: result.conflict === 'tech_busy'
          ? 'That tech is already booked at that time (or the slot was just taken).'
          : 'That time is outside the tech\'s posted availability. Add a block first or pick a different time.',
        ...echo
      });
    }
    throw redirect(303, `/jobs/${result.id}`);
  }
};
