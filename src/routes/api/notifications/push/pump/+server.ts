import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pumpPush } from '$lib/server/notifications';

export const POST: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  if (locals.user.role !== 'admin') throw error(403, 'Forbidden');
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  return json(await pumpPush(limit));
};
