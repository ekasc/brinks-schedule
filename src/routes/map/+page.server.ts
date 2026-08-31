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
    const jobs = await listJobsForMapForTech(locals.user.id);
    const techs = [{ id: locals.user.id, display_name: locals.user.display_name }];
    return {
      jobs,
      techs,
      unmapped: await countUnmappedForTech(locals.user.id),
      canGeocode: (env.GEOCODER || 'photon').toLowerCase() !== 'none'
    };
  }
  const jobs = await listAllJobsForMap();
  const techs = (await listUsers()).filter((u) => u.role === 'tech');
  return {
    jobs,
    techs,
    unmapped: await countUnmapped(),
    canGeocode: (env.GEOCODER || 'photon').toLowerCase() !== 'none'
  };
};

export const actions: Actions = {
  geocodeAll: async ({ locals }) => {
    if (!locals.user || locals.user.role !== 'admin') throw redirect(302, '/login');
    try {
      const res = await geocodeMissingCoords(100);
      return { ...res, ok: true };
    } catch {
      return fail(500, { ok: false, error: 'Geocoding failed.' });
    }
  }
};
