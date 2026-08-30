import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';

export const POST: RequestHandler = async ({ cookies }) => {
  cookies.delete('bs_session', { path: '/', secure: !dev });
  throw redirect(303, '/login');
};

export const GET: RequestHandler = async ({ cookies }) => {
  cookies.delete('bs_session', { path: '/', secure: !dev });
  throw redirect(303, '/login');
};
