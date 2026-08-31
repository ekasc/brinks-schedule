import { redirect, type Handle } from '@sveltejs/kit';
import { userFromCookie } from '$lib/server/auth';
import { getRedirect, isDeprecated, isAdminBlocked } from '$lib/server/routePolicy';
import { dev } from '$app/environment';

export { isDeprecated, isAdminBlocked, getRedirect };

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = await userFromCookie(event.request.headers.get('cookie'));
  if(!event.locals.user && event.cookies.get('bs_session')) event.cookies.delete('bs_session',{path:'/',secure:!dev});

  const path = event.url.pathname;
  const dest = getRedirect(path, event.locals.user as any);
  // getRedirect already handles unauth/public/framework cases
  // but we need to throw redirect if destination exists and the logic matches throw semantics
  // Re-derive throw conditions for consistency (getRedirect returns same)
  if (dest) {
    // Avoid interfering with public/framework already handled; getRedirect returns /login only when needed
    // We throw for any non-null redirect
    // Special: login redirect for authenticated already covered
    // Only throw if dest is not null; this matches getRedirect logic
    // But ensure we don't redirect _app etc. getRedirect already returns null for those when appropriate
    throw redirect(302, dest);
  }
  const response=await resolve(event);
  response.headers.set('x-content-type-options','nosniff');
  response.headers.set('x-frame-options','DENY');
  response.headers.set('referrer-policy','strict-origin-when-cross-origin');
  response.headers.set('permissions-policy','camera=(), microphone=(), geolocation=()');
  response.headers.set('content-security-policy',"base-uri 'self'; object-src 'none'; frame-ancestors 'none'");
  if(!dev) response.headers.set('strict-transport-security','max-age=31536000; includeSubDomains');
  return response;
};
