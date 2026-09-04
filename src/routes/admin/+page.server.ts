import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listUsers, createUser, updatePassword, updateDisplayName, updateUsername, updateRole, findUserById } from '$lib/server/db';

const validId=(id:number)=>Number.isSafeInteger(id)&&id>0;
const validUsername=(value:string)=>/^[a-z0-9._-]{3,64}$/.test(value);
const validDisplayName=(value:string)=>value.length>=1&&value.length<=100;
const validPassword=(value:string)=>value.length>=8&&value.length<=128;

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  if (locals.user.role !== 'admin') throw redirect(302, '/');
  return { users: await listUsers() };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const username = String(data.get('username') || '').trim().toLowerCase();
    const password = String(data.get('password') || '');
    const role = String(data.get('role') || '') as 'admin' | 'sales' | 'tech';
    const displayName = String(data.get('display_name') || '').trim();
    if (!validUsername(username) || !validDisplayName(displayName) || !validPassword(password)) return fail(400, { error: 'invalid account details' });
    if (!['admin', 'sales', 'tech'].includes(role)) return fail(400, { error: 'bad role' });
    try {
      await createUser(username, password, role, displayName);
    } catch (e: unknown) {
      const msg=e instanceof Error?e.message:'';
      if(/UNIQUE|unique/i.test(msg)) return fail(400,{error:'username already taken'});
      return fail(400, { error: 'could not create user' });
    }
    return { ok: true };
  },
  edit: async ({ request, locals }) => {
    if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const id = Number(data.get('id') || 0);
    const displayName = String(data.get('display_name') || '').trim();
    const username = String(data.get('username') || '').trim().toLowerCase();
    const role = String(data.get('role') || '') as 'admin' | 'sales' | 'tech';
    const password = String(data.get('password') || '');
    if (!validId(id) || !validDisplayName(displayName) || !validUsername(username)) return fail(400, { error: 'invalid account details' });
    if (!['admin', 'sales', 'tech'].includes(role)) return fail(400, { error: 'bad role' });
    if (password && !validPassword(password)) return fail(400, { error: 'invalid password' });
    const existing = await findUserById(id);
    if (!existing) return fail(404, { error: 'user not found' });
    try {
      if (displayName !== existing.display_name) await updateDisplayName(id, displayName);
      if (username !== existing.username) await updateUsername(id, username);
      if (role !== existing.role) await updateRole(id, role);
      if (password) await updatePassword(id, password);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (/UNIQUE|unique/i.test(msg)) return fail(400, { error: 'username already taken' });
      return fail(400, { error: 'could not update user' });
    }
    return { ok: true };
  }
};
