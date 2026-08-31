import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dev } from '$app/environment';
import { authenticate, sign } from '$lib/server/auth';
import { isLoginAllowed, recordLoginResult, touchLastLogin } from '$lib/server/db';
import { createHash } from 'node:crypto';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(302, '/');
  return {};
};

export const actions: Actions = {
  default: async ({ request, cookies, getClientAddress }) => {
    const data = await request.formData();
    const username = String(data.get('username') || '').trim();
    const password = String(data.get('password') || '');
    if (!username || !password || username.length>64 || password.length>128) return fail(400, { error: 'Username and password required', username:username.slice(0,64) });
    let address='unknown'; try { address=getClientAddress(); } catch {}
    const rateKey=createHash('sha256').update(`${address}\0${username.toLowerCase()}`).digest('hex');
    if(!(await isLoginAllowed(rateKey))) return fail(429,{error:'Too many attempts. Try again in 15 minutes.',username});
    const user = await authenticate(username, password);
    if (!user){ await recordLoginResult(rateKey,false); return fail(401, { error: 'Wrong username or password', username }); }
    await recordLoginResult(rateKey,true);
    await touchLastLogin(user.id);
    const token = sign({ uid: user.id, role: user.role, username: user.username, sv: user.session_version ?? 1 });
    cookies.set('bs_session', token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, secure: !dev });
    throw redirect(303, '/');
  }
};
