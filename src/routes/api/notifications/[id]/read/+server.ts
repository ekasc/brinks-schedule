import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { markRead } from '$lib/server/notifications';

export const POST: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw error(400, 'Invalid notification id');
  if (!await markRead(locals.user.id, id)) throw error(404, 'Notification not found');
  return json({ ok: true });
};
