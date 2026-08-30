import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dev } from '$app/environment';
import { authenticate, sign } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(302, '/');
  return {};
};

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const username = String(data.get('username') || '').trim();
    const password = String(data.get('password') || '');
    if (!username || !password) return fail(400, { error: 'Username and password required', username });
    const user = await authenticate(username, password);
    if (!user) return fail(401, { error: 'Wrong username or password', username });
    const token = sign({ uid: user.id, role: user.role, username: user.username });
    cookies.set('bs_session', token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30, secure: !dev });
    throw redirect(303, '/');
  }
};
