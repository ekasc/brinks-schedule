import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { autocomplete } from '$lib/server/geocode';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if ((env.GEOCODER || 'photon').toLowerCase() === 'none') return json({ suggestions: [] });

  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 3) return json({ suggestions: [] });

  const limit = Math.min(Number(url.searchParams.get('limit') || 5) || 5, 10);
  const suggestions = await autocomplete(q, limit);
  return json({ suggestions });
};
