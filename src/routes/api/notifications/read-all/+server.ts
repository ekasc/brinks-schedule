import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markAllRead } from '$lib/server/notifications';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  return json({ updated: await markAllRead(locals.user.id) });
};
