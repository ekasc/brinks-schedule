import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { autocomplete } from '$lib/server/geocode';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (locals.user.role === 'tech') throw error(403, 'Forbidden');
  if ((env.GEOCODER || 'photon').toLowerCase() === 'none') return json({ suggestions: [] });

  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 3) return json({ suggestions: [] });
  if (q.length > 200) throw error(400,'Query too long');

  const requested=Number(url.searchParams.get('limit') || 5);
  const limit = Number.isSafeInteger(requested) ? Math.min(Math.max(requested,1),10) : 5;
  const suggestions = await autocomplete(q, limit);
  return json({ suggestions });
};
