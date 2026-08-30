// Cloudflare D1 + local better-sqlite3 dual driver
// - On Cloudflare Workers: uses platform.env.DB (D1) via getRequestEvent, async
// - Locally (vite dev, node): uses better-sqlite3 sync, wrapped as async for uniform API
import bcrypt from 'bcryptjs';
import { env as privateEnv } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { dev } from '$app/environment';
import { geocode } from './geocode';

// --- PII encryption (works with nodejs_compat on Workers) ---
import crypto from 'node:crypto';
function getPiiKey(): Buffer {
  const secret = (privateEnv as any).PII_KEY || (privateEnv as any).JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('PII_KEY or JWT_SECRET must be set in production'); })() as never : 'dev-only-secret');
  return crypto.createHash('sha256').update(secret).digest();
}
export function encryptField(plain: string | null): string | null {
  if (plain == null || plain === '') return plain;
  if (plain.startsWith('enc:')) return plain;
  const key = getPiiKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}
export function decryptField(cipherText: string | null): string | null {
  if (cipherText == null || cipherText === '') return cipherText;
  if (!cipherText.startsWith('enc:')) return cipherText;
  try {
    const [, ivB64, tagB64, dataB64] = cipherText.split(':');
    const key = getPiiKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch { return cipherText; }
}
function decryptJobRow<T extends Record<string, any>>(row: T): T {
  if (!row) return row;
  const f = ['telus_pin','id_last4','emergency_name','emergency_number','emergency_relation','verbal_password','dob'];
  const out = { ...row };
  for (const k of f) if (k in out) (out as any)[k] = decryptField((out as any)[k]);
  return out;
}

// --- D1 vs local detection ---
type D1 = {
  prepare: (sql: string) => { bind: (...v: any[]) => { all: () => Promise<{results: any[]}>, first: () => Promise<any>, run: () => Promise<any> }, all: () => Promise<{results: any[]}>, first: () => Promise<any>, run: () => Promise<any> };
  batch: (stmts: any[]) => Promise<any>;
  exec: (sql: string) => Promise<any>;
};

// Schema applied once per process on first query. On local dev this runs via
// getLocal(); on Cloudflare it runs against the D1 binding (CREATE ... IF NOT EXISTS
// is idempotent, so it's safe to run on every cold start).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','sales','tech')), display_name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, last_login INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS availability_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_avail_tech_starts ON availability_blocks(tech_id, starts_at);
CREATE TABLE IF NOT EXISTS availability_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, dow INTEGER NOT NULL CHECK (dow >=0 AND dow <=6), start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, booked_by INTEGER NOT NULL, client_name TEXT NOT NULL, address TEXT NOT NULL, lat REAL, lng REAL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','cancelled')), completed_at INTEGER, notes TEXT, email TEXT, dob TEXT, telus_pin TEXT, id_type TEXT CHECK (id_type IS NULL OR id_type IN ('dl','passport','bcid','other')), id_last4 TEXT, emergency_name TEXT, emergency_number TEXT, emergency_relation TEXT, verbal_password TEXT, svc_internet INTEGER NOT NULL DEFAULT 0, svc_home_phone INTEGER NOT NULL DEFAULT 0, svc_tv INTEGER NOT NULL DEFAULT 0, themes TEXT, security_offered TEXT, phone TEXT, price_cents INTEGER NOT NULL DEFAULT 0, payout_cents INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_jobs_tech_starts ON jobs(tech_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, actor_id INTEGER, kind TEXT NOT NULL, from_val TEXT, to_val TEXT, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, created_at);
CREATE TABLE IF NOT EXISTS pii_access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, accessor_id INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
`;
let _schemaReady: Promise<void> | null = null;
function ensureSchemaOnce(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const d1 = getD1();
      if (d1) await d1.exec(SCHEMA);
    })();
  }
  return _schemaReady;
}

function getD1(): D1 | null {
  // `vite dev` always uses local better-sqlite3 (the adapter injects a D1
  // binding in dev too, but it's empty — we want the real local DB there).
  if (dev) return null;
  try {
    const ev = getRequestEvent();
    const db = ev?.platform?.env?.DB as D1 | undefined;
    if (db) return db;
  } catch {}
  // also check globalThis for wrangler dev
  try {
    const g: any = globalThis as any;
    if (g.DB) return g.DB as D1;
  } catch {}
  return null;
}

// --- local better-sqlite3 lazy ---
let _local: any = null;
async function getLocal() {
  if (_local) return _local;
  // Variable specifier prevents esbuild from statically resolving/bundling the
  // native better-sqlite3 addon into the Cloudflare worker (it's only used locally).
  const spec = 'better-sqlite3';
  const Database = (await import(/* @vite-ignore */ spec)).default;
  const { existsSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const DB_PATH = (privateEnv as any).DB_PATH || './data/schedule.db';
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const d = new Database(DB_PATH);
  d.pragma('journal_mode = WAL'); d.pragma('foreign_keys = ON');
  // schema
  d.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','sales','tech')), display_name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, last_login INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
  CREATE TABLE IF NOT EXISTS availability_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS idx_avail_tech_starts ON availability_blocks(tech_id, starts_at);
  CREATE TABLE IF NOT EXISTS availability_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, dow INTEGER NOT NULL CHECK (dow >=0 AND dow <=6), start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, booked_by INTEGER NOT NULL, client_name TEXT NOT NULL, address TEXT NOT NULL, lat REAL, lng REAL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','cancelled')), completed_at INTEGER, notes TEXT, email TEXT, dob TEXT, telus_pin TEXT, id_type TEXT CHECK (id_type IS NULL OR id_type IN ('dl','passport','bcid','other')), id_last4 TEXT, emergency_name TEXT, emergency_number TEXT, emergency_relation TEXT, verbal_password TEXT, svc_internet INTEGER NOT NULL DEFAULT 0, svc_home_phone INTEGER NOT NULL DEFAULT 0, svc_tv INTEGER NOT NULL DEFAULT 0, themes TEXT, security_offered TEXT, phone TEXT, price_cents INTEGER NOT NULL DEFAULT 0, payout_cents INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS idx_jobs_tech_starts ON jobs(tech_id, starts_at);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
  CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, actor_id INTEGER, kind TEXT NOT NULL, from_val TEXT, to_val TEXT, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, created_at);
  CREATE TABLE IF NOT EXISTS pii_access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, accessor_id INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
  `);
  // migrations
  if (!d.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='payout_cents')) d.exec(`ALTER TABLE jobs ADD COLUMN payout_cents INTEGER NOT NULL DEFAULT 0;`);
  if (!d.prepare(`PRAGMA table_info(users)`).all().some((c:any)=>c.name==='is_active')) d.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
  if (!d.prepare(`PRAGMA table_info(users)`).all().some((c:any)=>c.name==='last_login')) d.exec(`ALTER TABLE users ADD COLUMN last_login INTEGER;`);
  _local = d;
  return d;
}

// helpers to run query on correct driver
async function d1All(sql: string, ...params: any[]) {
  await ensureSchemaOnce();
  const d1 = getD1();
  if (d1) {
    const { results } = await d1.prepare(sql).bind(...params).all();
    return results;
  }
  const db = await getLocal();
  return db.prepare(sql).all(...params);
}
async function d1Get(sql: string, ...params: any[]) {
  await ensureSchemaOnce();
  const d1 = getD1();
  if (d1) return await d1.prepare(sql).bind(...params).first();
  const db = await getLocal();
  return db.prepare(sql).get(...params);
}
async function d1Run(sql: string, ...params: any[]) {
  await ensureSchemaOnce();
  const d1 = getD1();
  if (d1) return await d1.prepare(sql).bind(...params).run();
  const db = await getLocal();
  return db.prepare(sql).run(...params);
}
async function d1Exec(sql: string) {
  await ensureSchemaOnce();
  const d1 = getD1();
  if (d1) return await d1.exec(sql);
  const db = await getLocal();
  return db.exec(sql);
}

// re-export types
export interface User { id: number; username: string; role: 'admin'|'sales'|'tech'; display_name: string; is_active?: number; last_login?: number|null; password_hash?: string; }
export interface AvailabilityBlock { id: number; tech_id: number; starts_at: number; ends_at: number; note: string|null; }
export interface AvailabilityTemplate { id: number; tech_id: number; dow: number; start_min: number; end_min: number; note: string|null; }
export interface Job { id: number; tech_id: number; booked_by: number; client_name: string; address: string; lat: number|null; lng: number|null; starts_at: number; ends_at: number; status: 'sent'|'signed'|'cancelled'; completed_at: number|null; notes: string|null; email: string|null; dob: string|null; telus_pin: string|null; id_type: string|null; id_last4: string|null; emergency_name: string|null; emergency_number: string|null; emergency_relation: string|null; verbal_password: string|null; svc_internet: number; svc_home_phone: number; svc_tv: number; themes: string|null; security_offered: string|null; phone: string|null; price_cents: number; payout_cents: number; }
export interface JobWithTech extends Job { tech_name: string; booker_name: string; }

// users
export async function createUser(username: string, password: string, role: 'admin'|'sales'|'tech', display_name: string): Promise<number> {
  const hash = bcrypt.hashSync(password, 10);
  const r: any = await d1Run(`INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)`, username, hash, role, display_name);
  return Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? 0);
}
export async function findUserByUsername(username: string): Promise<User|undefined> { return await d1Get(`SELECT * FROM users WHERE username = ?`, username) as any; }
export async function findUserById(id: number): Promise<User|undefined> { return await d1Get(`SELECT id, username, role, display_name, is_active, last_login FROM users WHERE id = ?`, id) as any; }
export async function findUserByIdFull(id: number): Promise<User|undefined> { return await d1Get(`SELECT * FROM users WHERE id = ?`, id) as any; }
export async function listUsers(role?: 'admin'|'sales'|'tech'): Promise<User[]> {
  if (role) return await d1All(`SELECT id, username, role, display_name, is_active, last_login FROM users WHERE role = ? ORDER BY display_name`, role) as any;
  return await d1All(`SELECT id, username, role, display_name, is_active, last_login FROM users ORDER BY role, display_name`) as any;
}
export async function listActiveUsers(role?: 'admin'|'sales'|'tech'): Promise<User[]> {
  if (role) return await d1All(`SELECT id, username, role, display_name, is_active FROM users WHERE role = ? AND is_active = 1 ORDER BY display_name`, role) as any;
  return await d1All(`SELECT id, username, role, display_name, is_active FROM users WHERE is_active = 1 ORDER BY role, display_name`) as any;
}
export function verifyPassword(user: User, password: string): boolean { if (!user.password_hash) return false; return bcrypt.compareSync(password, user.password_hash); }
export async function updatePassword(id: number, password: string){ const h=bcrypt.hashSync(password,10); await d1Run(`UPDATE users SET password_hash = ? WHERE id = ?`, h, id); }
export async function updateDisplayName(id: number, name: string){ await d1Run(`UPDATE users SET display_name = ? WHERE id = ?`, name, id); }
export async function setUserActive(id: number, active: boolean){ await d1Run(`UPDATE users SET is_active = ? WHERE id = ?`, active?1:0, id); }
export async function touchLastLogin(id: number){ await d1Run(`UPDATE users SET last_login = unixepoch() WHERE id = ?`, id); }

// availability
export async function addAvailability(techId: number, startsAt: number, endsAt: number, note: string|null){ const r:any = await d1Run(`INSERT INTO availability_blocks (tech_id, starts_at, ends_at, note) VALUES (?, ?, ?, ?)`, techId, startsAt, endsAt, note); return Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? 0); }
export async function listAvailability(techId: number, fromTs: number, toTs: number){ return await d1All(`SELECT * FROM availability_blocks WHERE tech_id = ? AND starts_at < ? AND ends_at > ? ORDER BY starts_at`, techId, toTs, fromTs) as AvailabilityBlock[]; }
export async function removeAvailability(id: number, techId: number){ await d1Run(`DELETE FROM availability_blocks WHERE id = ? AND tech_id = ?`, id, techId); }
export async function copyAvailabilityWeek(techId: number, fromWeekStartTs: number, toWeekStartTs: number): Promise<number>{
  const fromEnd = fromWeekStartTs + 7*86400; const blocks = await listAvailability(techId, fromWeekStartTs, fromEnd); if (!blocks.length) return 0;
  const offset = toWeekStartTs - fromWeekStartTs;
  const d1 = getD1();
  if (d1) {
    const stmts = blocks.map(b => d1.prepare(`INSERT INTO availability_blocks (tech_id, starts_at, ends_at, note) VALUES (?, ?, ?, ?)`).bind(techId, b.starts_at+offset, b.ends_at+offset, b.note));
    await d1.batch(stmts as any);
  } else {
    const db = await getLocal(); const ins = db.prepare(`INSERT INTO availability_blocks (tech_id, starts_at, ends_at, note) VALUES (?, ?, ?, ?)`); const tx = db.transaction((rows: AvailabilityBlock[])=>{ for(const b of rows) ins.run(techId, b.starts_at+offset, b.ends_at+offset, b.note); }); tx(blocks);
  }
  return blocks.length;
}
export async function listTemplates(techId: number){ return await d1All(`SELECT * FROM availability_templates WHERE tech_id = ? ORDER BY dow, start_min`, techId) as AvailabilityTemplate[]; }
export async function addTemplate(techId: number, dow: number, startMin: number, endMin: number, note: string|null){ const r:any = await d1Run(`INSERT INTO availability_templates (tech_id, dow, start_min, end_min, note) VALUES (?, ?, ?, ?, ?)`, techId, dow, startMin, endMin, note); return Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? 0); }
export async function removeTemplate(id: number, techId: number){ await d1Run(`DELETE FROM availability_templates WHERE id = ? AND tech_id = ?`, id, techId); }
export async function applyTemplates(techId: number, weekStartTs: number): Promise<number>{
  const templates = await listTemplates(techId); if (!templates.length) return 0;
  let count=0;
  for (const t of templates){
    const dayTs = weekStartTs + t.dow*86400; const d = new Date(dayTs*1000); d.setHours(0,0,0,0); const base = Math.floor(d.getTime()/1000);
    const s = base + t.start_min*60; const e = base + t.end_min*60; if (e<=s) continue;
    const overlap = await d1Get(`SELECT id FROM availability_blocks WHERE tech_id = ? AND starts_at < ? AND ends_at > ? LIMIT 1`, techId, e, s);
    if (overlap) continue;
    await d1Run(`INSERT INTO availability_blocks (tech_id, starts_at, ends_at, note) VALUES (?, ?, ?, ?)`, techId, s, e, t.note); count++;
  }
  return count;
}

// jobs
export interface NewJob { tech_id: number; booked_by: number; client_name: string; address: string; starts_at: number; ends_at: number; notes?: string|null; email?: string|null; dob?: string|null; telus_pin?: string|null; id_type?: any; id_last4?: string|null; emergency_name?: string|null; emergency_number?: string|null; emergency_relation?: string|null; verbal_password?: string|null; svc_internet?: boolean; svc_home_phone?: boolean; svc_tv?: boolean; themes?: string|null; security_offered?: string|null; phone?: string|null; price_cents?: number; payout_cents?: number; }
export async function createJob(j: NewJob): Promise<{id:number}|{conflict:'tech_busy'|'outside_availability'}>{
  const overlap = await d1Get(`SELECT id FROM jobs WHERE tech_id = ? AND status = 'signed' AND starts_at < ? AND ends_at > ? LIMIT 1`, j.tech_id, j.ends_at, j.starts_at);
  if (overlap) return { conflict: 'tech_busy' };
  const blocks = await d1All(`SELECT id FROM availability_blocks WHERE tech_id = ? AND starts_at < ? AND ends_at > ?`, j.tech_id, j.ends_at, j.starts_at);
  if (!blocks.length) return { conflict: 'outside_availability' };
  const r:any = await d1Run(`INSERT INTO jobs (tech_id, booked_by, client_name, address, starts_at, ends_at, notes, email, dob, telus_pin, id_type, id_last4, emergency_name, emergency_number, emergency_relation, verbal_password, svc_internet, svc_home_phone, svc_tv, themes, security_offered, phone, price_cents, payout_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    j.tech_id, j.booked_by, j.client_name, j.address, j.starts_at, j.ends_at, j.notes ?? null, j.email ?? null, encryptField(j.dob ?? null), encryptField(j.telus_pin ?? null), j.id_type ?? null, encryptField(j.id_last4 ?? null), encryptField(j.emergency_name ?? null), encryptField(j.emergency_number ?? null), encryptField(j.emergency_relation ?? null), encryptField(j.verbal_password ?? null), j.svc_internet?1:0, j.svc_home_phone?1:0, j.svc_tv?1:0, j.themes ?? null, j.security_offered ?? null, j.phone ?? null, j.price_cents ?? 0, j.payout_cents ?? 0);
  const id = Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? 0);
  await d1Run(`INSERT INTO job_events (job_id, actor_id, kind, to_val) VALUES (?, ?, 'created', ?)`, id, j.booked_by, `${j.client_name} @ ${j.starts_at}`);
  return { id };
}
export async function getJob(id: number): Promise<JobWithTech|undefined>{
  const row = await d1Get(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by WHERE j.id = ?`, id) as any;
  if (!row) return undefined; return decryptJobRow(row) as any;
}
export async function getJobRaw(id: number){ return await d1Get(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by WHERE j.id = ?`, id) as any; }
export async function updateJob(id: number, patch: any, actorId?: number): Promise<{ok:true}|{conflict:string}>{
  const existing: any = await getJobRaw(id); if (!existing) return { conflict: 'not found' };
  const nextTech = patch.tech_id ?? existing.tech_id; const nextStart = patch.starts_at ?? existing.starts_at; const nextEnd = patch.ends_at ?? existing.ends_at;
  if ((patch.tech_id!=null || patch.starts_at!=null || patch.ends_at!=null) && existing.status==='signed'){
    const overlap = await d1Get(`SELECT id FROM jobs WHERE tech_id = ? AND id != ? AND status='signed' AND starts_at < ? AND ends_at > ? LIMIT 1`, nextTech, id, nextEnd, nextStart);
    if (overlap) return { conflict: 'That tech is already booked at that time.' };
    const blocks = await d1All(`SELECT id FROM availability_blocks WHERE tech_id = ? AND starts_at < ? AND ends_at > ?`, nextTech, nextEnd, nextStart);
    if (!blocks.length) return { conflict: "That time is outside the tech's posted hours." };
  }
  const map: Record<string,string> = { tech_id:'tech_id', client_name:'client_name', address:'address', starts_at:'starts_at', ends_at:'ends_at', notes:'notes', email:'email', dob:'dob', telus_pin:'telus_pin', id_type:'id_type', id_last4:'id_last4', emergency_name:'emergency_name', emergency_number:'emergency_number', emergency_relation:'emergency_relation', verbal_password:'verbal_password', themes:'themes', security_offered:'security_offered', payout_cents:'payout_cents'};
  const fields:string[]=[]; const vals:any={};
  for (const [k,col] of Object.entries(map)){
    if ((patch as any)[k]!==undefined){
      let v:any=(patch as any)[k];
      if (['dob','telus_pin','id_last4','emergency_name','emergency_number','emergency_relation','verbal_password'].includes(k)) v=encryptField(v);
      fields.push(`${col} = ?`); vals[k]=v;
    }
  }
  if (patch.svc_internet!==undefined){ fields.push(`svc_internet = ?`); vals.svc_internet=patch.svc_internet?1:0; }
  if (patch.svc_home_phone!==undefined){ fields.push(`svc_home_phone = ?`); vals.svc_home_phone=patch.svc_home_phone?1:0; }
  if (patch.svc_tv!==undefined){ fields.push(`svc_tv = ?`); vals.svc_tv=patch.svc_tv?1:0; }
  if (!fields.length) return { ok:true };
  fields.push(`updated_at = unixepoch()`);
  const setClause = fields.join(', ');
  const paramVals = [...Object.values(vals), id];
  // build ordered params matching fields
  const ordered: any[] = [];
  for (const k of Object.keys(vals)) ordered.push((vals as any)[k]);
  ordered.push(id);
  // need to map correctly — simpler rebuild
  let sql = `UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`;
  // reconstruct ordered correctly: fields correspond to vals in insertion order
  // our fields order is map order + svc fields, vals order matches
  const allParams = Object.values(vals);
  await d1Run(sql, ...allParams, id);
  if (actorId) await d1Run(`INSERT INTO job_events (job_id, actor_id, kind, to_val) VALUES (?, ?, 'edited', ?)`, id, actorId, JSON.stringify(Object.keys(vals)));
  return { ok:true };
}
export async function deleteJob(id: number){ await d1Run(`DELETE FROM jobs WHERE id = ?`, id); }
export async function duplicateJob(id: number, actorId: number, overrides: any={}): Promise<any>{
  const j:any = await getJobRaw(id); if (!j) return { conflict:'not found' }; const dec = decryptJobRow(j);
  return createJob({ tech_id: overrides.tech_id ?? j.tech_id, booked_by: actorId, client_name: overrides.client_name ?? dec.client_name, address: overrides.address ?? dec.address, starts_at: overrides.starts_at ?? j.starts_at, ends_at: overrides.ends_at ?? j.ends_at, notes: overrides.notes ?? j.notes, email: j.email, dob: dec.dob, telus_pin: dec.telus_pin, id_type: j.id_type, id_last4: dec.id_last4, emergency_name: dec.emergency_name, emergency_number: dec.emergency_number, emergency_relation: dec.emergency_relation, verbal_password: dec.verbal_password, svc_internet: !!j.svc_internet, svc_home_phone: !!j.svc_home_phone, svc_tv: !!j.svc_tv, themes: j.themes, security_offered: j.security_offered, phone: j.phone, price_cents: j.price_cents } as any);
}
export async function listJobsForUser(user: {id:number; role:string}, fromTs: number, toTs: number){
  let rows:any[];
  if (user.role==='tech') rows = await d1All(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by WHERE j.tech_id=? AND j.starts_at < ? AND j.ends_at > ? AND j.status='signed' ORDER BY j.starts_at`, user.id, toTs, fromTs);
  else rows = await d1All(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by WHERE j.starts_at < ? AND j.ends_at > ? ORDER BY j.starts_at`, toTs, fromTs);
  return (rows as any[]).map(decryptJobRow);
}
export async function listUpcomingForUser(user: {id:number; role:string}, fromTs: number, limit=10){
  let rows:any[];
  if (user.role==='tech') rows = await d1All(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id WHERE j.tech_id=? AND j.ends_at >= ? AND j.status='signed' ORDER BY j.starts_at LIMIT ?`, user.id, fromTs, limit);
  else rows = await d1All(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id WHERE j.ends_at >= ? ORDER BY j.starts_at LIMIT ?`, fromTs, limit);
  return (rows as any[]).map(decryptJobRow);
}
export async function searchJobs(q: string, fromTs?: number, toTs?: number, techId?: number){
  const like=`%${q.trim()}%`; let sql=`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by WHERE (j.client_name LIKE ? OR j.address LIKE ? OR j.email LIKE ? OR j.notes LIKE ?)`; const params:any[]=[like,like,like,like];
  if (fromTs!=null && toTs!=null){ sql+=` AND j.starts_at < ? AND j.ends_at > ?`; params.push(toTs, fromTs); }
  if (techId!=null){ sql+=` AND j.tech_id = ?`; params.push(techId); }
  sql+=` ORDER BY j.starts_at DESC LIMIT 50`;
  const rows = await d1All(sql, ...params);
  return (rows as any[]).map(decryptJobRow);
}
export async function setJobStatus(id: number, status: string, actorId?: number){ const before:any = await d1Get(`SELECT status FROM jobs WHERE id=?`, id); await d1Run(`UPDATE jobs SET status = ?, updated_at = unixepoch() WHERE id = ?`, status, id); await d1Run(`INSERT INTO job_events (job_id, actor_id, kind, from_val, to_val) VALUES (?, ?, 'status', ?, ?)`, id, actorId ?? null, before?.status ?? null, status); }
export async function setJobCompleted(id: number, completed_at: number|null, actorId?: number){ await d1Run(`UPDATE jobs SET completed_at = ?, updated_at = unixepoch() WHERE id = ?`, completed_at, id); await d1Run(`INSERT INTO job_events (job_id, actor_id, kind, to_val) VALUES (?, ?, ?, ?)`, id, actorId ?? null, completed_at?'completed':'reopened', String(completed_at ?? '')); }
export async function setJobCoords(id: number, lat: number, lng: number, actorId?: number){ await d1Run(`UPDATE jobs SET lat = ?, lng = ?, updated_at = unixepoch() WHERE id = ?`, lat, lng, id); if (actorId) await d1Run(`INSERT INTO job_events (job_id, actor_id, kind, to_val) VALUES (?, ?, 'coords', ?)`, id, actorId, `${lat},${lng}`); }
export async function listJobEvents(jobId: number){ return await d1All(`SELECT e.*, u.display_name as actor_name FROM job_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.job_id=? ORDER BY e.created_at DESC`, jobId) as any[]; }
export async function logPiiAccess(jobId: number, accessorId: number){ await d1Run(`INSERT INTO pii_access_log (job_id, accessor_id) VALUES (?, ?)`, jobId, accessorId); }
export async function listPiiAccess(jobId: number){ return await d1All(`SELECT l.*, u.display_name FROM pii_access_log l JOIN users u ON u.id=l.accessor_id WHERE l.job_id=? ORDER BY l.created_at DESC LIMIT 20`, jobId) as any; }
export async function getAvailableSlots(techId: number, opts: any={}): Promise<{starts_at:number; ends_at:number}[]>{
  const fromTs = opts.fromTs ?? Math.floor(Date.now()/1000); const horizon = new Date(); horizon.setDate(horizon.getDate()+30); const toTs = opts.toTs ?? Math.floor(horizon.getTime()/1000);
  const dur = (opts.durationMin ?? 90)*60; const step=(opts.stepMin ??30)*60; const buf=(opts.bufferMin ??30)*60;
  const blocks = await listAvailability(techId, fromTs, toTs); if (!blocks.length) return [];
  const jobs = (await listJobs(fromTs-buf, toTs+buf, techId)).filter((j:any)=>j.status==='signed');
  const blocked = jobs.map((j:any)=>({ start:j.starts_at-buf, end:j.ends_at+buf }));
  function isBlocked(s:number,e:number){ for(const b of blocked) if (s<b.end && e>b.start) return true; return false; }
  const out:any[]=[]; for(const blk of blocks){ let s=Math.max(blk.starts_at, fromTs); const sDate=new Date(s*1000); const sMin=sDate.getMinutes(); if(sMin!==0 && sMin!==30){ const bump=30-(sMin%30); s+=bump*60; } while(s+dur<=blk.ends_at && s+dur<=toTs){ const e=s+dur; if(s>=Math.floor(Date.now()/1000) && !isBlocked(s,e)) out.push({starts_at:s, ends_at:e}); s+=step; } } return out;
}
export async function listAllJobsForMap(){ return await d1All(`SELECT j.id, j.client_name, j.address, j.lat, j.lng, j.status, j.starts_at, t.display_name AS tech_name FROM jobs j JOIN users t ON t.id=j.tech_id WHERE j.lat IS NOT NULL AND j.lng IS NOT NULL ORDER BY j.starts_at`) as any; }
// Contracts roster: one row per job (a contract is one-per-person on a 3-year term).
export async function listContracts(): Promise<JobWithTech[]> {
  return (await d1All(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by ORDER BY j.client_name COLLATE NOCASE`)) as JobWithTech[];
}

// How many jobs still have no coordinates (used by the map empty-state + backfill CTA).
export async function countUnmapped(): Promise<number> {
  const row = await d1Get(`SELECT COUNT(*) AS c FROM jobs WHERE lat IS NULL OR lng IS NULL`);
  return (row as any)?.c ?? 0;
}

// Backfill coordinates for jobs created before geocoding (or with it off).
export async function geocodeMissingCoords(limit = 100): Promise<{ done: number; ok: number; failed: number }> {
  const rows = (await d1All(`SELECT id, address FROM jobs WHERE lat IS NULL OR lng IS NULL LIMIT ?`, limit)) as { id: number; address: string }[];
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const c = await geocode(row.address);
      if (c) { await setJobCoords(row.id, c.lat, c.lng); ok++; }
      else failed++;
    } catch { failed++; }
  }
  return { done: rows.length, ok, failed };
}
export async function listJobs(fromTs: number, toTs: number, techId?: number){
  let rows:any[];
  if (techId!=null) rows = await d1All(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by WHERE j.tech_id = ? AND j.starts_at < ? AND j.ends_at > ? ORDER BY j.starts_at`, techId, toTs, fromTs);
  else rows = await d1All(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by WHERE j.starts_at < ? AND j.ends_at > ? ORDER BY j.starts_at`, toTs, fromTs);
  return (rows as any[]).map(decryptJobRow);
}
export async function getIncomeForUser(userId: number, role: string, fromTs?: number, toTs?: number){
  let where=''; const params:any[]=[];
  if (role==='tech'){ where='tech_id = ?'; params.push(userId); }
  else if (role==='sales'){ where='booked_by = ?'; params.push(userId); }
  else { where='(tech_id = ? OR booked_by = ?)'; params.push(userId,userId); }
  if (fromTs!=null && toTs!=null){ where+=' AND starts_at >= ? AND starts_at < ?'; params.push(fromTs,toTs); }
  return await d1Get(`SELECT COUNT(*) as total, SUM(CASE WHEN status='signed' THEN 1 ELSE 0 END) as signed, SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) as sent, SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled, SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed, COALESCE(SUM(CASE WHEN status='signed' THEN payout_cents ELSE 0 END),0) as earned_cents, COALESCE(SUM(CASE WHEN status='sent' THEN payout_cents ELSE 0 END),0) as pending_cents, COALESCE(SUM(CASE WHEN completed_at IS NOT NULL THEN payout_cents ELSE 0 END),0) as completed_cents FROM jobs WHERE ${where}`, ...params) as any;
}
export async function listIncomeJobs(userId: number, role: string, limit=50){
  let where=''; const params:any[]=[];
  if (role==='tech'){ where='j.tech_id = ?'; params.push(userId); }
  else if (role==='sales'){ where='j.booked_by = ?'; params.push(userId); }
  else { where='(j.tech_id = ? OR j.booked_by = ?)'; params.push(userId,userId); }
  const rows = await d1All(`SELECT j.*, t.display_name as tech_name, b.display_name as booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by WHERE ${where} ORDER BY j.starts_at DESC LIMIT ?`, ...params, limit) as any[];
  return (rows as any[]).map(decryptJobRow);
}
export async function getAllIncomeSummary(fromTs?: number, toTs?: number){
  let where='1=1'; const params:any[]=[];
  if (fromTs!=null && toTs!=null){ where+=' AND starts_at >= ? AND starts_at < ?'; params.push(fromTs,toTs); }
  return await d1All(`SELECT u.id, u.display_name, u.role, COUNT(j.id) as jobs, COALESCE(SUM(CASE WHEN j.status='signed' THEN j.payout_cents ELSE 0 END),0) as earned_cents, COALESCE(SUM(CASE WHEN j.completed_at IS NOT NULL THEN j.payout_cents ELSE 0 END),0) as completed_cents FROM users u LEFT JOIN jobs j ON (j.tech_id=u.id OR j.booked_by=u.id) AND ${where} WHERE u.is_active=1 GROUP BY u.id ORDER BY earned_cents DESC`, ...params) as any[];
}
export async function getTeamStats(fromTs?: number, toTs?: number){
  const users = (await listUsers()).filter((u:any)=>u.is_active!==0);
  const out:any[]=[];
  for(const u of users){
    const role=u.role; let where=''; const params:any[]=[];
    if (role==='tech'){ where='tech_id = ?'; params.push(u.id); }
    else if (role==='sales'){ where='booked_by = ?'; params.push(u.id); }
    else { where='(tech_id = ? OR booked_by = ?)'; params.push(u.id,u.id); }
    if (fromTs!=null && toTs!=null){ where+=' AND starts_at >= ? AND starts_at < ?'; params.push(fromTs,toTs); }
    const row:any = await d1Get(`SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN status='signed' THEN 1 ELSE 0 END),0) as signed, COALESCE(SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END),0) as sent, COALESCE(SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END),0) as cancelled, COALESCE(SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END),0) as completed, COALESCE(SUM(payout_cents),0) as total_cents, COALESCE(SUM(CASE WHEN status='signed' THEN payout_cents ELSE 0 END),0) as earned_cents FROM jobs WHERE ${where}`, ...params);
    let blocks:any=0;
    if (role==='tech' || role==='admin'){
      if (fromTs!=null && toTs!=null) blocks = await d1Get(`SELECT COUNT(*) as c FROM availability_blocks WHERE tech_id=? AND starts_at >= ? AND starts_at < ?`, u.id, fromTs, toTs);
      else blocks = await d1Get(`SELECT COUNT(*) as c FROM availability_blocks WHERE tech_id=?`, u.id);
      blocks = (blocks as any)?.c ?? 0;
    }
    const conversion = row.total?Math.round((row.signed/row.total)*100):0;
    const completion = row.signed?Math.round((row.completed/row.signed)*100):0;
    out.push({ id:u.id, display_name:u.display_name, role:u.role, ...row, blocks, conversion, completion });
  }
  return out.sort((a,b)=>b.total-a.total);
}
export async function getSystemStats(fromTs?: number, toTs?: number){
  let where='1=1'; const params:any[]=[];
  if (fromTs!=null && toTs!=null){ where+=' AND starts_at >= ? AND starts_at < ?'; params.push(fromTs,toTs); }
  const r:any = await d1Get(`SELECT COUNT(*) as total, COALESCE(SUM(CASE WHEN status='signed' THEN 1 ELSE 0 END),0) as signed, COALESCE(SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END),0) as sent, COALESCE(SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END),0) as cancelled, COALESCE(SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END),0) as completed, COALESCE(SUM(payout_cents),0) as total_cents, COALESCE(SUM(CASE WHEN status='signed' THEN payout_cents ELSE 0 END),0) as earned_cents FROM jobs WHERE ${where}`, ...params);
  r.conversion = r.total?Math.round((r.signed/r.total)*100):0; r.completion = r.signed?Math.round((r.completed/r.signed)*100):0; return r;
}
export async function haversineKm(aLat:number,aLng:number,bLat:number,bLng:number): Promise<number>{ const R=6371; const toRad=(d:number)=>d*Math.PI/180; const dLat=toRad(bLat-aLat); const dLng=toRad(bLng-aLng); const lat1=toRad(aLat); const lat2=toRad(bLat); const x=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
export async function travelMinutes(aLat:number,aLng:number,bLat:number,bLng:number, speedKmh=45){ return Math.round((await haversineKm(aLat,aLng,bLat,bLng)/speedKmh)*60); }
export async function isTight(aLat:number,aLng:number,bLat:number,bLng:number,gapMin:number){ return (await travelMinutes(aLat,aLng,bLat,bLng))>gapMin; }
