import { redirect, type Handle } from '@sveltejs/kit';
import { userFromCookie } from '$lib/server/auth';

const PUBLIC_PATHS = ['/login', '/logout', '/favicon.ico', '/manifest.webmanifest', '/sw.js'];

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = await userFromCookie(event.request.headers.get('cookie'));

  const path = event.url.pathname;
  const isPublic = PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));
  // The Cloudflare adapter fetches `/[fallback]` at build time to generate the SPA
  // shell; don't redirect it (the root load renders a public shell for it).
  if (!event.locals.user && !isPublic && path !== '/[fallback]') {
    throw redirect(302, '/login');
  }
  if (event.locals.user && path === '/login') {
    throw redirect(302, '/');
  }
  return resolve(event);
};
