import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '$env/dynamic/private';
import type { User } from './db';
import { findUserByUsername, findUserById, verifyPassword } from './db';

const SECRET = env.JWT_SECRET || 'dev-only-secret';
const COOKIE = 'bs_session';

export interface SessionPayload {
  uid: number;
  role: 'admin' | 'sales' | 'tech';
  username: string;
}

export function sign(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

export function verify(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function makeCookie(value: string): string {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}
export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
export function readCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE) return v;
  }
  return null;
}

export function authenticate(username: string, password: string): User | null {
  const u = findUserByUsername(username.toLowerCase().trim());
  if (!u) return null;
  if (!verifyPassword(u, password)) return null;
  return findUserById(u.id);
}

export function userFromCookie(cookieHeader: string | null): User | null {
  const token = readCookie(cookieHeader);
  if (!token) return null;
  const payload = verify(token);
  if (!payload) return null;
  return findUserById(payload.uid);
}

// --- password helpers (re-exported for the admin "set password" page) ---
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}
