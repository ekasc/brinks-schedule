import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { unreadCount } from '$lib/server/notifications';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  return json({ unread: await unreadCount(locals.user.id) });
};
