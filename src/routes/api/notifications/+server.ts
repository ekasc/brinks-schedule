import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listForUser } from '$lib/server/notifications';

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
  const rawBefore = Number(url.searchParams.get('before'));
  const before = Number.isSafeInteger(rawBefore) && rawBefore > 0 ? rawBefore : undefined;
  return json(await listForUser(locals.user.id, limit, before));
};
