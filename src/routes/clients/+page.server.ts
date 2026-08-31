import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listContracts } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role === 'tech') throw redirect(302, '/');
  return { contracts: await listContracts(), isAdmin: locals.user.role === 'admin' };
};
