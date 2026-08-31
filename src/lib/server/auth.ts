import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import type { User } from './db';
import { findUserByUsername, findUserById, verifyPassword } from './db';

const SECRET = env.JWT_SECRET;
const FINAL_SECRET = SECRET ?? 'dev-only-secret';
if (!SECRET && dev) {
  console.warn('[auth] JWT_SECRET is not set — using an insecure dev-only fallback. Set JWT_SECRET before deploying.');
}
const COOKIE = 'bs_session';

export interface SessionPayload {
  uid: number;
  role: 'admin' | 'sales' | 'tech';
  username: string;
  sv: number;
}

export function sign(payload: SessionPayload): string {
  if (!SECRET && !dev) throw new Error('JWT_SECRET must be set in production. Refusing to sign sessions.');
  return jwt.sign(payload, FINAL_SECRET, { expiresIn: '30d' });
}

export function verify(token: string): SessionPayload | null {
  if (!SECRET && !dev) return null;
  try {
    return jwt.verify(token, FINAL_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}


export function readCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE) return v;
  }
  return null;
}

export async function authenticate(username: string, password: string): Promise<User | null> {
  const u = await findUserByUsername(username.toLowerCase().trim());
  if (!u || u.is_active !== 1) return null;
  if (!verifyPassword(u, password)) return null;
  const user=await findUserById(u.id);
  return user?.is_active===1 ? user : null;
}

export async function userFromCookie(cookieHeader: string | null): Promise<User | null> {
  const token = readCookie(cookieHeader);
  if (!token) return null;
  const payload = verify(token);
  if (!payload) return null;
  const user=await findUserById(payload.uid);
  if(!user || user.is_active!==1 || user.session_version!==payload.sv) return null;
  return user;
}

// --- password helpers (re-exported for the admin "set password" page) ---
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}
