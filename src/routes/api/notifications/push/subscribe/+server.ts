import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { subscribe } from '$lib/server/notifications';
import { isAllowedPushEndpoint } from '$lib/server/pushEndpoint';

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const input = await request.json().catch(() => null) as any;
  if (!input || typeof input.endpoint !== 'string' || typeof input.keys?.p256dh !== 'string' || typeof input.keys?.auth !== 'string') throw error(400, 'Invalid subscription');
  let endpoint: URL;
  try { endpoint = new URL(input.endpoint); } catch { throw error(400, 'Invalid endpoint'); }
  if (!isAllowedPushEndpoint(endpoint.href) || input.endpoint.length > 2048 || input.keys.p256dh.length < 32 || input.keys.p256dh.length > 256 || input.keys.auth.length < 8 || input.keys.auth.length > 128) throw error(400, 'Invalid subscription');
  await subscribe(locals.user.id, { endpoint: endpoint.href, keys: { p256dh: input.keys.p256dh, auth: input.keys.auth } });
  return json({ ok: true }, { status: 201 });
};
