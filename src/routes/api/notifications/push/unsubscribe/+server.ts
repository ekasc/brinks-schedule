import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { unsubscribe } from '$lib/server/notifications';
import { isAllowedPushEndpoint } from '$lib/server/pushEndpoint';

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const input = await request.json().catch(() => null) as any;
  if (!input || typeof input.endpoint !== 'string' || input.endpoint.length > 2048) throw error(400, 'Invalid endpoint');
  let endpoint: URL;
  try { endpoint = new URL(input.endpoint); } catch { throw error(400, 'Invalid endpoint'); }
  if (!isAllowedPushEndpoint(endpoint.href)) throw error(400, 'Invalid endpoint');
  return json({ removed: await unsubscribe(locals.user.id, endpoint.href) });
};
