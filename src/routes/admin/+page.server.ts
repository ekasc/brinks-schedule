import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listUsers, createUser, updatePassword, updateDisplayName } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role !== 'admin') throw redirect(302, '/');
  return { users: listUsers() };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const username = String(data.get('username') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const role = String(data.get('role') || '') as 'admin' | 'sales' | 'tech';
    const displayName = String(data.get('display_name') || '').trim();
    if (!username || !password || !role || !displayName) return fail(400, { error: 'fill all fields' });
    if (!['admin', 'sales', 'tech'].includes(role)) return fail(400, { error: 'bad role' });
    if (password.length < 6) return fail(400, { error: 'password too short' });
    try {
      createUser(username, password, role, displayName);
    } catch (e: any) {
      return fail(400, { error: e?.message || 'could not create user' });
    }
    return { ok: true };
  },
  password: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const id = Number(data.get('id') || 0);
    const password = String(data.get('password') || '');
    if (!id || password.length < 6) return fail(400, { error: 'bad input' });
    updatePassword(id, password);
    return { ok: true };
  },
  rename: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const id = Number(data.get('id') || 0);
    const displayName = String(data.get('display_name') || '').trim();
    if (!id || !displayName) return fail(400, { error: 'bad input' });
    updateDisplayName(id, displayName);
    return { ok: true };
  }
};
