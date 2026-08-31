import { env } from '$env/dynamic/private';
import { listForUser } from '$lib/server/notifications';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');

  return {
    ...(await listForUser(locals.user.id, 100)),
    vapidPublicKey: env.VAPID_PUBLIC_KEY || null
  };
};
