import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
  // must not set Secure=false on plain-http or the browser refuses to delete it
  cookies.delete('bs_session', { path: '/', secure: false });
  throw redirect(303, '/login');
};

export const GET: RequestHandler = async ({ cookies }) => {
  cookies.delete('bs_session', { path: '/', secure: false });
  throw redirect(303, '/login');
};
