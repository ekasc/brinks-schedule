import { redirect, type Handle } from '@sveltejs/kit';
import { userFromCookie } from '$lib/server/auth';

const PUBLIC_PATHS = ['/login', '/logout', '/favicon.ico', '/manifest.webmanifest', '/sw.js'];

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = userFromCookie(event.request.headers.get('cookie'));

  const path = event.url.pathname;
  const isPublic = PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));
  if (!event.locals.user && !isPublic) {
    throw redirect(302, '/login');
  }
  if (event.locals.user && path === '/login') {
    throw redirect(302, '/');
  }
  return resolve(event);
};
