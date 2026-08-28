import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listAllJobsForMap } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  return {
    jobs: listAllJobsForMap()
  };
};
