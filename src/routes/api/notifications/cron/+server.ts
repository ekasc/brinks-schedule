import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateMorningSummaries, pumpPush, reconcileNotifications } from '$lib/server/notifications';

export const POST: RequestHandler = async ({ request }) => {
  const secret=env.CRON_SECRET;
  if(!secret || request.headers.get('authorization')!==`Bearer ${secret}`) throw error(401,'Unauthorized');
  const repaired=await reconcileNotifications();
  const summaries=await generateMorningSummaries();
  const push=await pumpPush(100);
  return json({repaired,summaries,push});
};
