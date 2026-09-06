import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import {
  listAllJobsForMap,
  listJobsForMapForTech,
  listUsers,
  countUnmapped,
  countUnmappedForTech,
  geocodeMissingCoords
} from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'admin') throw redirect(302, '/clients');
  if (locals.user.role === 'tech') {
    // Independent queries — one round trip instead of two.
    const [jobs, unmapped] = await Promise.all([
      listJobsForMapForTech(locals.user.id),
      countUnmappedForTech(locals.user.id)
    ]);
    const techs = [{ id: locals.user.id, display_name: locals.user.display_name }];
    return {
      jobs,
      techs,
      unmapped,
      canGeocode: (env.GEOCODER || 'photon').toLowerCase() !== 'none'
    };
  }
  // Independent queries — one round trip instead of three.
  // All techs, including inactive: is_active gates login, never the
  // visibility of existing assignments.
  const [jobs, users, unmapped] = await Promise.all([listAllJobsForMap(), listUsers(), countUnmapped()]);
  const techs = users.filter((u) => u.role === 'tech');
  return {
    jobs,
    techs,
    unmapped,
    canGeocode: (env.GEOCODER || 'photon').toLowerCase() !== 'none'
  };
};

export const actions: Actions = {
  geocodeAll: async ({ locals }) => {
    // Any signed-in role may backfill pins (idempotent). The old admin-only
    // guard made the button fail for every viewer, since admins never load this page.
    // Techs are scoped to their own jobs so one tap can't burn quota globally.
    if (!locals.user) throw redirect(302, '/login');
    try {
      const res = await geocodeMissingCoords(100, locals.user.role === 'tech' ? locals.user.id : undefined);
      return { ...res, ok: true };
    } catch {
      return fail(500, { ok: false, error: 'Geocoding failed.' });
    }
  }
};
