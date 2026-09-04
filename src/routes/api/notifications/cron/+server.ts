import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateMorningSummaries, pumpPush, reconcileNotifications } from '$lib/server/notifications';
import { pruneOldNotifications } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  const secret=env.CRON_SECRET;
  if(!secret || request.headers.get('authorization')!==`Bearer ${secret}`) throw error(401,'Unauthorized');
  const repaired=await reconcileNotifications();
  const summaries=await generateMorningSummaries();
  const pruned=await pruneOldNotifications();
  // Push is optional infra: without VAPID keys pumpPush throws, which used to
  // 500 the whole cron (and its retries) after the real work had succeeded.
  const vapid = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT;
  const push = vapid ? await pumpPush(100) : { claimed: 0, sent: 0, failed: 0, skipped: true };
  return json({repaired,summaries,pruned,push});
};
