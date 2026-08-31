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
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','sales','tech')), display_name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 1, last_login INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS availability_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_avail_tech_starts ON availability_blocks(tech_id, starts_at);
CREATE TABLE IF NOT EXISTS availability_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, dow INTEGER NOT NULL CHECK (dow >=0 AND dow <=6), start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'available' CHECK (kind IN ('available','unavailable')), note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_templates_tech_dow ON availability_templates(tech_id, dow);
CREATE TABLE IF NOT EXISTS availability_unavailable (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_unavail_tech_starts ON availability_unavailable(tech_id, starts_at);
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, booked_by INTEGER NOT NULL, client_name TEXT NOT NULL, address TEXT NOT NULL, lat REAL, lng REAL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','cancelled')), completed_at INTEGER, notes TEXT, email TEXT, dob TEXT, telus_pin TEXT, id_type TEXT CHECK (id_type IS NULL OR id_type IN ('dl','passport','bcid','other')), id_last4 TEXT, emergency_name TEXT, emergency_number TEXT, emergency_relation TEXT, verbal_password TEXT, svc_internet INTEGER NOT NULL DEFAULT 0, svc_internet_detail TEXT, svc_home_phone INTEGER NOT NULL DEFAULT 0, svc_home_phone_detail TEXT, svc_tv INTEGER NOT NULL DEFAULT 0, svc_tv_detail TEXT, themes TEXT, security_offered TEXT, phone TEXT, price_cents INTEGER NOT NULL DEFAULT 0, payout_cents INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_jobs_tech_starts ON jobs(tech_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, actor_id INTEGER, kind TEXT NOT NULL, from_val TEXT, to_val TEXT, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, created_at);
CREATE TABLE IF NOT EXISTS pii_access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, accessor_id INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT, dedupe_key TEXT NOT NULL, read_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()), UNIQUE(user_id, dedupe_key), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS notification_state (id INTEGER PRIMARY KEY CHECK(id=1), started_at INTEGER NOT NULL);
INSERT OR IGNORE INTO notification_state(id,started_at) VALUES(1,unixepoch());
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS push_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, notification_id INTEGER NOT NULL, subscription_id INTEGER NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()), lease_until INTEGER, lease_token TEXT, delivered_at INTEGER, last_error TEXT, UNIQUE(notification_id, subscription_id), FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE, FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS login_rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, failures INTEGER NOT NULL, blocked_until INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_push_pending ON push_deliveries(delivered_at, next_attempt_at, lease_until);
CREATE TRIGGER IF NOT EXISTS notifications_enqueue_push AFTER INSERT ON notifications BEGIN INSERT OR IGNORE INTO push_deliveries(notification_id, subscription_id) SELECT NEW.id, id FROM push_subscriptions WHERE user_id=NEW.user_id; END;
`;
let _schemaReady: Promise<void> | null = null;
function ensureSchemaOnce(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const d1 = getD1();
      if (d1) {
        await d1.exec(SCHEMA);
        for (const col of ['svc_internet_detail TEXT', 'svc_home_phone_detail TEXT', 'svc_tv_detail TEXT']) {
          try { await d1.exec(`ALTER TABLE jobs ADD COLUMN ${col}`); } catch {}
        }
        try { await d1.exec(`ALTER TABLE availability_templates ADD COLUMN kind TEXT NOT NULL DEFAULT 'available' CHECK (kind IN ('available','unavailable'))`); } catch {}
        try { await d1.exec(`ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1`); } catch {}
      }
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

// --- test seam: isolated temp DB for scheduling tests (keeps SQL authoritative) ---
let _testDbPath: string | null = null;
export function __setTestDbPath(p: string | null) { _testDbPath = p; if (_local) { try { _local.close(); } catch {} } _local = null; _schemaReady = null; }
export function __getTestDbPath(): string | null { return _testDbPath; }

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
  const DB_PATH = _testDbPath ?? (privateEnv as any).DB_PATH ?? (process.env as any).DB_PATH ?? './data/schedule.db';
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const d = new Database(DB_PATH);
  d.pragma('journal_mode = WAL'); d.pragma('foreign_keys = ON');
  // schema
  d.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','sales','tech')), display_name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 1, last_login INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
  CREATE TABLE IF NOT EXISTS availability_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS idx_avail_tech_starts ON availability_blocks(tech_id, starts_at);
  CREATE TABLE IF NOT EXISTS availability_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, dow INTEGER NOT NULL CHECK (dow >=0 AND dow <=6), start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'available' CHECK (kind IN ('available','unavailable')), note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS idx_templates_tech_dow ON availability_templates(tech_id, dow);
  CREATE TABLE IF NOT EXISTS availability_unavailable (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS idx_unavail_tech_starts ON availability_unavailable(tech_id, starts_at);
  CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, booked_by INTEGER NOT NULL, client_name TEXT NOT NULL, address TEXT NOT NULL, lat REAL, lng REAL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','cancelled')), completed_at INTEGER, notes TEXT, email TEXT, dob TEXT, telus_pin TEXT, id_type TEXT CHECK (id_type IS NULL OR id_type IN ('dl','passport','bcid','other')), id_last4 TEXT, emergency_name TEXT, emergency_number TEXT, emergency_relation TEXT, verbal_password TEXT, svc_internet INTEGER NOT NULL DEFAULT 0, svc_internet_detail TEXT, svc_home_phone INTEGER NOT NULL DEFAULT 0, svc_home_phone_detail TEXT, svc_tv INTEGER NOT NULL DEFAULT 0, svc_tv_detail TEXT, themes TEXT, security_offered TEXT, phone TEXT, price_cents INTEGER NOT NULL DEFAULT 0, payout_cents INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS idx_jobs_tech_starts ON jobs(tech_id, starts_at);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
  CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
  CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, actor_id INTEGER, kind TEXT NOT NULL, from_val TEXT, to_val TEXT, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE);
  CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, created_at);
  CREATE TABLE IF NOT EXISTS pii_access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, accessor_id INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
  CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT, dedupe_key TEXT NOT NULL, read_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()), UNIQUE(user_id, dedupe_key), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS notification_state (id INTEGER PRIMARY KEY CHECK(id=1), started_at INTEGER NOT NULL);
  INSERT OR IGNORE INTO notification_state(id,started_at) VALUES(1,unixepoch());
  CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS push_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, notification_id INTEGER NOT NULL, subscription_id INTEGER NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()), lease_until INTEGER, lease_token TEXT, delivered_at INTEGER, last_error TEXT, UNIQUE(notification_id, subscription_id), FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE, FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE);
  CREATE TABLE IF NOT EXISTS login_rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, failures INTEGER NOT NULL, blocked_until INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS idx_push_pending ON push_deliveries(delivered_at, next_attempt_at, lease_until);
  CREATE TRIGGER IF NOT EXISTS notifications_enqueue_push AFTER INSERT ON notifications BEGIN INSERT OR IGNORE INTO push_deliveries(notification_id, subscription_id) SELECT NEW.id, id FROM push_subscriptions WHERE user_id=NEW.user_id; END;
  `);
  // migrations
  if (!d.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='svc_internet_detail')) d.exec(`ALTER TABLE jobs ADD COLUMN svc_internet_detail TEXT;`);
  if (!d.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='svc_home_phone_detail')) d.exec(`ALTER TABLE jobs ADD COLUMN svc_home_phone_detail TEXT;`);
  if (!d.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='svc_tv_detail')) d.exec(`ALTER TABLE jobs ADD COLUMN svc_tv_detail TEXT;`);
  if (!d.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='payout_cents')) d.exec(`ALTER TABLE jobs ADD COLUMN payout_cents INTEGER NOT NULL DEFAULT 0;`);
  if (!d.prepare(`PRAGMA table_info(users)`).all().some((c:any)=>c.name==='is_active')) d.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
  if (!d.prepare(`PRAGMA table_info(users)`).all().some((c:any)=>c.name==='last_login')) d.exec(`ALTER TABLE users ADD COLUMN last_login INTEGER;`);
  if (!d.prepare(`PRAGMA table_info(users)`).all().some((c:any)=>c.name==='session_version')) d.exec(`ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;`);
  if (!d.prepare(`PRAGMA table_info(availability_templates)`).all().some((c:any)=>c.name==='kind')) d.exec(`ALTER TABLE availability_templates ADD COLUMN kind TEXT NOT NULL DEFAULT 'available' CHECK (kind IN ('available','unavailable'));`);
  // ensure new tables exist on existing DBs (IF NOT EXISTS already, but ensure indexes)
  try { d.exec(`CREATE INDEX IF NOT EXISTS idx_templates_tech_dow ON availability_templates(tech_id, dow)`); } catch {}
  try { d.exec(`CREATE INDEX IF NOT EXISTS idx_unavail_tech_starts ON availability_unavailable(tech_id, starts_at)`); } catch {}
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

function getMutationMeta(r: any): { changes: number; lastId: number } {
  const changes = Number(r?.changes ?? r?.meta?.changes ?? r?.meta?.rows_written ?? 0);
  const lastId = Number(r?.lastInsertRowid ?? r?.meta?.last_row_id ?? r?.lastInsertRowId ?? 0);
  return { changes, lastId };
}

// re-export types
export interface User { id: number; username: string; role: 'admin'|'sales'|'tech'; display_name: string; is_active?: number; session_version?: number; last_login?: number|null; password_hash?: string; }
export interface AvailabilityBlock { id: number; tech_id: number; starts_at: number; ends_at: number; note: string|null; }
export interface AvailabilityTemplate { id: number; tech_id: number; dow: number; start_min: number; end_min: number; kind: 'available'|'unavailable'; note: string|null; }
export interface AvailabilityUnavailable { id: number; tech_id: number; starts_at: number; ends_at: number; reason: string|null; }
export interface Job { id: number; tech_id: number; booked_by: number; client_name: string; address: string; lat: number|null; lng: number|null; starts_at: number; ends_at: number; status: 'sent'|'signed'|'cancelled'; completed_at: number|null; notes: string|null; email: string|null; dob: string|null; telus_pin: string|null; id_type: string|null; id_last4: string|null; emergency_name: string|null; emergency_number: string|null; emergency_relation: string|null; verbal_password: string|null; svc_internet: number; svc_internet_detail: string|null; svc_home_phone: number; svc_home_phone_detail: string|null; svc_tv: number; svc_tv_detail: string|null; themes: string|null; security_offered: string|null; phone: string|null; price_cents: number; payout_cents: number; }
export interface JobWithTech extends Job { tech_name: string; booker_name: string; }

// users
export async function createUser(username: string, password: string, role: 'admin'|'sales'|'tech', display_name: string): Promise<number> {
  const hash = bcrypt.hashSync(password, 10);
  const r: any = await d1Run(`INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)`, username, hash, role, display_name);
  return Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? 0);
}
export async function findUserByUsername(username: string): Promise<User|undefined> { return await d1Get(`SELECT * FROM users WHERE username = ?`, username) as any; }
export async function findUserById(id: number): Promise<User|undefined> { return await d1Get(`SELECT id, username, role, display_name, is_active, session_version, last_login FROM users WHERE id = ?`, id) as any; }
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
export async function updatePassword(id: number, password: string){ const h=bcrypt.hashSync(password,10); await d1Run(`UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?`, h, id); }
export async function updateDisplayName(id: number, name: string){ await d1Run(`UPDATE users SET display_name = ? WHERE id = ?`, name, id); }
export async function updateUsername(id: number, username: string){ await d1Run(`UPDATE users SET username = ?, session_version = session_version + 1 WHERE id = ?`, username, id); }
export async function updateRole(id: number, role: 'admin'|'sales'|'tech'){ await d1Run(`UPDATE users SET role = ?, session_version = session_version + 1 WHERE id = ?`, role, id); }
export async function setUserActive(id: number, active: boolean){ await d1Run(`UPDATE users SET is_active = ?, session_version = session_version + 1 WHERE id = ?`, active?1:0, id); }
export async function touchLastLogin(id: number){ await d1Run(`UPDATE users SET last_login = unixepoch() WHERE id = ?`, id); }
export async function isLoginAllowed(key:string){ const row:any=await d1Get(`SELECT blocked_until FROM login_rate_limits WHERE key=?`,key); return !row || Number(row.blocked_until)<=Math.floor(Date.now()/1000); }
export async function recordLoginResult(key:string,success:boolean){
  if(success){ await d1Run(`DELETE FROM login_rate_limits WHERE key=?`,key); return; }
  const now=Math.floor(Date.now()/1000), cutoff=now-900;
  await d1Run(`INSERT INTO login_rate_limits(key,window_start,failures,blocked_until) VALUES(?,?,1,0) ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN window_start<? THEN 1 ELSE failures+1 END,window_start=CASE WHEN window_start<? THEN ? ELSE window_start END,blocked_until=CASE WHEN (CASE WHEN window_start<? THEN 1 ELSE failures+1 END)>=5 THEN ? ELSE blocked_until END`,key,now,cutoff,cutoff,now,cutoff,now+900);
}

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
export async function addTemplate(techId: number, dow: number, startMin: number, endMin: number, note: string|null, kind: 'available'|'unavailable'='available'){ const r:any = await d1Run(`INSERT INTO availability_templates (tech_id, dow, start_min, end_min, kind, note) VALUES (?, ?, ?, ?, ?, ?)`, techId, dow, startMin, endMin, kind, note); return Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? 0); }
export async function removeTemplate(id: number, techId: number){ await d1Run(`DELETE FROM availability_templates WHERE id = ? AND tech_id = ?`, id, techId); }
// Pattern helpers
export async function setPatternsForTech(techId: number, patterns: {dow:number; start_min:number; end_min:number; kind?: 'available'|'unavailable'; note?:string|null}[]): Promise<void>{
  const d1 = getD1();
  if (d1) {
    await d1Run(`DELETE FROM availability_templates WHERE tech_id = ?`, techId);
    if (!patterns.length) return;
    const stmts = patterns.map(p => d1.prepare(`INSERT INTO availability_templates (tech_id, dow, start_min, end_min, kind, note) VALUES (?, ?, ?, ?, ?, ?)`).bind(techId, p.dow, p.start_min, p.end_min, p.kind ?? 'available', p.note ?? null));
    await d1.batch(stmts as any);
  } else {
    const db = await getLocal();
    const tx = db.transaction((rows: typeof patterns)=>{
      db.prepare(`DELETE FROM availability_templates WHERE tech_id = ?`).run(techId);
      const ins = db.prepare(`INSERT INTO availability_templates (tech_id, dow, start_min, end_min, kind, note) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const p of rows) ins.run(techId, p.dow, p.start_min, p.end_min, p.kind ?? 'available', p.note ?? null);
    });
    tx(patterns);
  }
}
export async function setPatternsForDow(techId: number, dow: number, intervals: {start_min:number; end_min:number; kind?: 'available'|'unavailable'; note?:string|null}[]): Promise<void>{
  const d1 = getD1();
  if (d1) {
    await d1Run(`DELETE FROM availability_templates WHERE tech_id = ? AND dow = ?`, techId, dow);
    if (!intervals.length) return;
    const stmts = intervals.map(p => d1.prepare(`INSERT INTO availability_templates (tech_id, dow, start_min, end_min, kind, note) VALUES (?, ?, ?, ?, ?, ?)`).bind(techId, dow, p.start_min, p.end_min, p.kind ?? 'available', p.note ?? null));
    await d1.batch(stmts as any);
  } else {
    const db = await getLocal();
    const tx = db.transaction((rows: typeof intervals)=>{
      db.prepare(`DELETE FROM availability_templates WHERE tech_id = ? AND dow = ?`).run(techId, dow);
      const ins = db.prepare(`INSERT INTO availability_templates (tech_id, dow, start_min, end_min, kind, note) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const p of rows) ins.run(techId, dow, p.start_min, p.end_min, p.kind ?? 'available', p.note ?? null);
    });
    tx(intervals);
  }
}
// Unavailable / blocked hours
export async function addUnavailable(techId: number, startsAt: number, endsAt: number, reason: string|null){ const r:any = await d1Run(`INSERT INTO availability_unavailable (tech_id, starts_at, ends_at, reason) VALUES (?, ?, ?, ?)`, techId, startsAt, endsAt, reason); return Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? 0); }
export async function listUnavailable(techId: number, fromTs: number, toTs: number){ return await d1All(`SELECT * FROM availability_unavailable WHERE tech_id = ? AND starts_at < ? AND ends_at > ? ORDER BY starts_at`, techId, toTs, fromTs) as AvailabilityUnavailable[]; }
export async function listAllUnavailable(techId: number){ return await d1All(`SELECT * FROM availability_unavailable WHERE tech_id = ? ORDER BY starts_at`, techId) as AvailabilityUnavailable[]; }
export async function removeUnavailable(id: number, techId: number){ await d1Run(`DELETE FROM availability_unavailable WHERE id = ? AND tech_id = ?`, id, techId); }
export async function applyTemplates(techId: number, weekStartTs: number): Promise<number>{
  const templates = (await listTemplates(techId)).filter((t:any)=>(t.kind ?? 'available')==='available'); if (!templates.length) return 0;
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
export interface NewJob { tech_id: number; booked_by: number; client_name: string; address: string; starts_at: number; ends_at: number; lat?: number|null; lng?: number|null; notes?: string|null; email?: string|null; dob?: string|null; telus_pin?: string|null; id_type?: any; id_last4?: string|null; emergency_name?: string|null; emergency_number?: string|null; emergency_relation?: string|null; verbal_password?: string|null; svc_internet?: boolean; svc_internet_detail?: string|null; svc_home_phone?: boolean; svc_home_phone_detail?: string|null; svc_tv?: boolean; svc_tv_detail?: string|null; themes?: string|null; security_offered?: string|null; phone?: string|null; price_cents?: number; payout_cents?: number; }
export const SLOT_HORIZON_DAYS = 30;

function minutesOfDay(ts: number): number {
  const d = new Date(ts*1000);
  return d.getHours()*60 + d.getMinutes();
}
function sameLocalDate(aTs: number, bTs: number): boolean {
  const a = new Date(aTs*1000); const b = new Date(bTs*1000);
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
export async function isJobWithinAvailability(techId: number, startsAt: number, endsAt: number): Promise<boolean> {
  if (!sameLocalDate(startsAt, endsAt)) return false;
  const dow = new Date(startsAt*1000).getDay();
  const sMin = minutesOfDay(startsAt);
  const eMin = minutesOfDay(endsAt);
  const eMinAdj = endsAt > startsAt && eMin===0 && new Date(endsAt*1000).getHours()===0 && new Date(endsAt*1000).getMinutes()===0 ? 1440 : eMin;
  const templates = await listTemplates(techId);
  // unavailable template overlap rejects immediately
  for (const t of templates) {
    if (t.dow !== dow) continue;
    const kind = (t as any).kind ?? 'available';
    if (kind === 'unavailable' && t.start_min < eMinAdj && t.end_min > sMin) return false;
  }
  // ad hoc unavailable
  const unavailable = await listUnavailable(techId, startsAt, endsAt);
  if (unavailable.some(u => u.starts_at < endsAt && u.ends_at > startsAt)) return false;
  // available check: inside an available template OR extra block
  const block = await d1Get(`SELECT id FROM availability_blocks WHERE tech_id = ? AND starts_at <= ? AND ends_at >= ? LIMIT 1`, techId, startsAt, endsAt);
  if (block) return true;
  for (const t of templates) {
    if (t.dow !== dow) continue;
    const kind = (t as any).kind ?? 'available';
    if (kind !== 'available') continue;
    if (t.start_min <= sMin && eMinAdj <= t.end_min) return true;
  }
  return false;
}
function availabilitySqlExists(techIdParam: string, startsParam: string, endsParam: string): string {
  const startMinExpr = `CAST(strftime('%H', datetime(${startsParam}, 'unixepoch','localtime')) AS INTEGER)*60 + CAST(strftime('%M', datetime(${startsParam}, 'unixepoch','localtime')) AS INTEGER)`;
  const endMinExpr = `CASE WHEN CAST(strftime('%H', datetime(${endsParam}, 'unixepoch','localtime')) AS INTEGER)=0 AND CAST(strftime('%M', datetime(${endsParam}, 'unixepoch','localtime')) AS INTEGER)=0 THEN 1440 ELSE CAST(strftime('%H', datetime(${endsParam}, 'unixepoch','localtime')) AS INTEGER)*60 + CAST(strftime('%M', datetime(${endsParam}, 'unixepoch','localtime')) AS INTEGER) END`;
  const dowExpr = `CAST(strftime('%w', datetime(${startsParam}, 'unixepoch','localtime')) AS INTEGER)`;
  return `(
    (
      EXISTS (SELECT 1 FROM availability_blocks WHERE tech_id = ${techIdParam} AND starts_at <= ${startsParam} AND ends_at >= ${endsParam})
      OR EXISTS (
        SELECT 1 FROM availability_templates
        WHERE tech_id = ${techIdParam}
          AND kind = 'available'
          AND dow = ${dowExpr}
          AND date(datetime(${startsParam}, 'unixepoch','localtime')) = date(datetime(${endsParam}, 'unixepoch','localtime'))
          AND start_min <= ${startMinExpr}
          AND end_min >= ${endMinExpr}
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM availability_templates
      WHERE tech_id = ${techIdParam}
        AND kind = 'unavailable'
        AND dow = ${dowExpr}
        AND date(datetime(${startsParam}, 'unixepoch','localtime')) = date(datetime(${endsParam}, 'unixepoch','localtime'))
        AND start_min < ${endMinExpr}
        AND end_min > ${startMinExpr}
    )
    AND NOT EXISTS (SELECT 1 FROM availability_unavailable WHERE tech_id = ${techIdParam} AND starts_at < ${endsParam} AND ends_at > ${startsParam})
  )`;
}

export async function hasNonCancelledOverlap(techId: number, startsAt: number, endsAt: number, excludeId?: number): Promise<boolean> {
  const row = excludeId != null
    ? await d1Get(`SELECT id FROM jobs WHERE tech_id = ? AND id != ? AND status != 'cancelled' AND starts_at < ? AND ends_at > ? LIMIT 1`, techId, excludeId, endsAt, startsAt)
    : await d1Get(`SELECT id FROM jobs WHERE tech_id = ? AND status != 'cancelled' AND starts_at < ? AND ends_at > ? LIMIT 1`, techId, endsAt, startsAt);
  return !!row;
}

export async function createJob(j: NewJob): Promise<{id:number}|{conflict:'tech_busy'|'outside_availability'}>{
  const availExists = availabilitySqlExists(String(j.tech_id), String(j.starts_at), String(j.ends_at));
  const r:any = await d1Run(`INSERT INTO jobs (tech_id, booked_by, client_name, address, lat, lng, starts_at, ends_at, notes, email, dob, telus_pin, id_type, id_last4, emergency_name, emergency_number, emergency_relation, verbal_password, svc_internet, svc_internet_detail, svc_home_phone, svc_home_phone_detail, svc_tv, svc_tv_detail, themes, security_offered, phone, price_cents, payout_cents) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${availExists} AND NOT EXISTS (SELECT 1 FROM jobs WHERE tech_id = ? AND status != 'cancelled' AND starts_at < ? AND ends_at > ?)`,
    j.tech_id, j.booked_by, j.client_name, j.address, j.lat ?? null, j.lng ?? null, j.starts_at, j.ends_at, j.notes ?? null, j.email ?? null, encryptField(j.dob ?? null), encryptField(j.telus_pin ?? null), j.id_type ?? null, encryptField(j.id_last4 ?? null), encryptField(j.emergency_name ?? null), encryptField(j.emergency_number ?? null), encryptField(j.emergency_relation ?? null), encryptField(j.verbal_password ?? null), j.svc_internet?1:0, j.svc_internet_detail ?? null, j.svc_home_phone?1:0, j.svc_home_phone_detail ?? null, j.svc_tv?1:0, j.svc_tv_detail ?? null, j.themes ?? null, j.security_offered ?? null, j.phone ?? null, j.price_cents ?? 0, j.payout_cents ?? 0,
    j.tech_id, j.ends_at, j.starts_at);
  const { changes, lastId } = getMutationMeta(r);
  if (changes === 0) {
    if (await hasNonCancelledOverlap(j.tech_id, j.starts_at, j.ends_at)) return { conflict: 'tech_busy' };
    if (!(await isJobWithinAvailability(j.tech_id, j.starts_at, j.ends_at))) return { conflict: 'outside_availability' };
    return { conflict: 'tech_busy' };
  }
  const id = lastId;
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
  const willBeNonCancelled = existing.status !== 'cancelled';
  const isSchedulingChange = (patch.tech_id!=null || patch.starts_at!=null || patch.ends_at!=null) && willBeNonCancelled;
  const map: Record<string,string> = { tech_id:'tech_id', client_name:'client_name', address:'address', starts_at:'starts_at', ends_at:'ends_at', notes:'notes', email:'email', dob:'dob', telus_pin:'telus_pin', id_type:'id_type', id_last4:'id_last4', emergency_name:'emergency_name', emergency_number:'emergency_number', emergency_relation:'emergency_relation', verbal_password:'verbal_password', themes:'themes', security_offered:'security_offered', payout_cents:'payout_cents', svc_internet_detail:'svc_internet_detail', svc_home_phone_detail:'svc_home_phone_detail', svc_tv_detail:'svc_tv_detail'};
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
  const allParams = Object.values(vals);
  if (isSchedulingChange) {
    const availExists = availabilitySqlExists(String(nextTech), String(nextStart), String(nextEnd));
    const sql = `UPDATE jobs SET ${fields.join(', ')} WHERE id = ? AND ${availExists} AND NOT EXISTS (SELECT 1 FROM jobs WHERE tech_id = ? AND id != ? AND status != 'cancelled' AND starts_at < ? AND ends_at > ?)`;
    const r:any = await d1Run(sql, ...allParams, id, nextTech, id, nextEnd, nextStart);
    const { changes } = getMutationMeta(r);
    if (changes === 0) {
      const stillExists = await d1Get(`SELECT id FROM jobs WHERE id = ?`, id);
      if (!stillExists) return { conflict: 'not found' };
      if (await hasNonCancelledOverlap(nextTech, nextStart, nextEnd, id)) return { conflict: 'That tech is already booked at that time.' };
      if (!(await isJobWithinAvailability(nextTech, nextStart, nextEnd))) return { conflict: "That time is outside the tech's posted hours." };
      return { conflict: 'That tech is already booked at that time.' };
    }
  } else {
    const sql = `UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`;
    await d1Run(sql, ...allParams, id);
  }
  if (actorId) await d1Run(`INSERT INTO job_events (job_id, actor_id, kind, to_val) VALUES (?, ?, 'edited', ?)`, id, actorId, JSON.stringify(Object.keys(vals)));
  return { ok:true };
}
export async function deleteJob(id: number){ await d1Run(`DELETE FROM jobs WHERE id = ?`, id); }
export async function duplicateJob(id: number, actorId: number, overrides: any={}): Promise<any>{
  const j:any = await getJobRaw(id); if (!j) return { conflict:'not found' }; const dec = decryptJobRow(j);
  return createJob({ tech_id: overrides.tech_id ?? j.tech_id, booked_by: actorId, client_name: overrides.client_name ?? dec.client_name, address: overrides.address ?? dec.address, lat: overrides.lat ?? j.lat, lng: overrides.lng ?? j.lng, starts_at: overrides.starts_at ?? j.starts_at, ends_at: overrides.ends_at ?? j.ends_at, notes: overrides.notes ?? j.notes, email: j.email, dob: dec.dob, telus_pin: dec.telus_pin, id_type: j.id_type, id_last4: dec.id_last4, emergency_name: dec.emergency_name, emergency_number: dec.emergency_number, emergency_relation: dec.emergency_relation, verbal_password: dec.verbal_password, svc_internet: !!j.svc_internet, svc_internet_detail: j.svc_internet_detail ?? null, svc_home_phone: !!j.svc_home_phone, svc_home_phone_detail: j.svc_home_phone_detail ?? null, svc_tv: !!j.svc_tv, svc_tv_detail: j.svc_tv_detail ?? null, themes: j.themes, security_offered: j.security_offered, phone: j.phone, price_cents: j.price_cents } as any);
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
export async function __setJobStatusConditional(id: number, status: string, expectedStatus: string): Promise<number> {
  const avail = `(
      (EXISTS (SELECT 1 FROM availability_blocks WHERE tech_id = jobs.tech_id AND starts_at <= jobs.starts_at AND ends_at >= jobs.ends_at)
       OR EXISTS (SELECT 1 FROM availability_templates WHERE tech_id = jobs.tech_id AND kind='available' AND dow = CAST(strftime('%w', datetime(jobs.starts_at,'unixepoch','localtime')) AS INTEGER) AND date(datetime(jobs.starts_at,'unixepoch','localtime'))=date(datetime(jobs.ends_at,'unixepoch','localtime')) AND start_min <= CAST(strftime('%H', datetime(jobs.starts_at,'unixepoch','localtime')) AS INTEGER)*60+CAST(strftime('%M', datetime(jobs.starts_at,'unixepoch','localtime')) AS INTEGER) AND end_min >= CASE WHEN CAST(strftime('%H', datetime(jobs.ends_at,'unixepoch','localtime')) AS INTEGER)=0 AND CAST(strftime('%M', datetime(jobs.ends_at,'unixepoch','localtime')) AS INTEGER)=0 THEN 1440 ELSE CAST(strftime('%H', datetime(jobs.ends_at,'unixepoch','localtime')) AS INTEGER)*60+CAST(strftime('%M', datetime(jobs.ends_at,'unixepoch','localtime')) AS INTEGER) END))
      AND NOT EXISTS (SELECT 1 FROM availability_templates WHERE tech_id = jobs.tech_id AND kind='unavailable' AND dow = CAST(strftime('%w', datetime(jobs.starts_at,'unixepoch','localtime')) AS INTEGER) AND date(datetime(jobs.starts_at,'unixepoch','localtime'))=date(datetime(jobs.ends_at,'unixepoch','localtime')) AND start_min < CASE WHEN CAST(strftime('%H', datetime(jobs.ends_at,'unixepoch','localtime')) AS INTEGER)=0 AND CAST(strftime('%M', datetime(jobs.ends_at,'unixepoch','localtime')) AS INTEGER)=0 THEN 1440 ELSE CAST(strftime('%H', datetime(jobs.ends_at,'unixepoch','localtime')) AS INTEGER)*60+CAST(strftime('%M', datetime(jobs.ends_at,'unixepoch','localtime')) AS INTEGER) END AND end_min > CAST(strftime('%H', datetime(jobs.starts_at,'unixepoch','localtime')) AS INTEGER)*60+CAST(strftime('%M', datetime(jobs.starts_at,'unixepoch','localtime')) AS INTEGER))
      AND NOT EXISTS (SELECT 1 FROM availability_unavailable WHERE tech_id = jobs.tech_id AND starts_at < jobs.ends_at AND ends_at > jobs.starts_at)
    )`;
  const r:any = await d1Run(
    `UPDATE jobs SET status = ?, updated_at = unixepoch() WHERE id = ? AND status = ? AND ${avail} AND NOT EXISTS (SELECT 1 FROM jobs AS other WHERE other.tech_id = jobs.tech_id AND other.id != jobs.id AND other.status != 'cancelled' AND other.starts_at < jobs.ends_at AND other.ends_at > jobs.starts_at)`,
    status, id, expectedStatus
  );
  return getMutationMeta(r).changes;
}
// Test-only alias — same function, clearly named for direct SQL regression testing.
export const __testOnly_setJobStatusConditional = __setJobStatusConditional;
export async function setJobStatus(id: number, status: string, actorId?: number): Promise<{ok:true}|{conflict:string}>{
  const before:any = await d1Get(`SELECT * FROM jobs WHERE id=?`, id);
  if (!before) return { conflict: 'not found' };
  if (status === before.status) return { ok:true };
  const needsSchedulingCheck = (status === 'sent' || status === 'signed');
  if (needsSchedulingCheck) {
    const changes = await __setJobStatusConditional(id, status, before.status);
    if (changes === 0) {
      const cur:any = await d1Get(`SELECT * FROM jobs WHERE id = ?`, id);
      if (!cur) return { conflict: 'not found' };
      if (cur.status !== before.status) return { conflict: 'That job was modified by another user. Please reload.' };
      if (await hasNonCancelledOverlap(cur.tech_id, cur.starts_at, cur.ends_at, id)) return { conflict: 'That tech is already booked at that time.' };
      if (!(await isJobWithinAvailability(cur.tech_id, cur.starts_at, cur.ends_at))) return { conflict: "That time is outside the tech's posted hours." };
      return { conflict: 'That tech is already booked at that time.' };
    }
  } else {
    const r:any = await d1Run(`UPDATE jobs SET status = ?, updated_at = unixepoch() WHERE id = ? AND status = ?`, status, id, before.status);
    const { changes } = getMutationMeta(r);
    if (changes === 0) {
      const cur:any = await d1Get(`SELECT * FROM jobs WHERE id = ?`, id);
      if (!cur) return { conflict: 'not found' };
      if (cur.status !== before.status) return { conflict: 'That job was modified by another user. Please reload.' };
      return { conflict: 'That job was modified by another user. Please reload.' };
    }
  }
  await d1Run(`INSERT INTO job_events (job_id, actor_id, kind, from_val, to_val) VALUES (?, ?, 'status', ?, ?)`, id, actorId ?? null, before?.status ?? null, status);
  return { ok:true };
}
export async function setJobCompleted(id: number, completed_at: number|null, actorId?: number){ await d1Run(`UPDATE jobs SET completed_at = ?, updated_at = unixepoch() WHERE id = ?`, completed_at, id); await d1Run(`INSERT INTO job_events (job_id, actor_id, kind, to_val) VALUES (?, ?, ?, ?)`, id, actorId ?? null, completed_at?'completed':'reopened', String(completed_at ?? '')); }
export async function setJobCoords(id: number, lat: number, lng: number, actorId?: number){ await d1Run(`UPDATE jobs SET lat = ?, lng = ?, updated_at = unixepoch() WHERE id = ?`, lat, lng, id); if (actorId) await d1Run(`INSERT INTO job_events (job_id, actor_id, kind, to_val) VALUES (?, ?, 'coords', ?)`, id, actorId, `${lat},${lng}`); }
export async function listJobEvents(jobId: number){ return await d1All(`SELECT e.*, u.display_name as actor_name FROM job_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.job_id=? ORDER BY e.created_at DESC`, jobId) as any[]; }
export async function logPiiAccess(jobId: number, accessorId: number){ await d1Run(`INSERT INTO pii_access_log (job_id, accessor_id) VALUES (?, ?)`, jobId, accessorId); }
export async function listPiiAccess(jobId: number){ return await d1All(`SELECT l.*, u.display_name FROM pii_access_log l JOIN users u ON u.id=l.accessor_id WHERE l.job_id=? ORDER BY l.created_at DESC LIMIT 20`, jobId) as any; }

// notifications
export async function createNotification(userId:number, title:string, body:string, url:string|null, dedupeKey:string){
  const r:any = await d1Run(`INSERT OR IGNORE INTO notifications(user_id,title,body,url,dedupe_key) VALUES(?,?,?,?,?)`, userId, title, body, url, dedupeKey);
  const changes=Number(r.changes??r.meta?.changes??0);
  return changes ? Number(r.lastInsertRowid ?? r.meta?.last_row_id ?? 0) : 0;
}
export async function listNotifications(userId:number, limit:number, beforeId?:number){
  return await d1All(`SELECT id,user_id,title,body,url,read_at,created_at FROM notifications WHERE user_id=? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?`, userId, beforeId ?? null, beforeId ?? null, limit) as any[];
}
export async function countUnreadNotifications(userId:number){ const r:any=await d1Get(`SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL`,userId); return Number(r?.c??0); }
export async function markNotificationRead(id:number,userId:number){ const r:any=await d1Run(`UPDATE notifications SET read_at=COALESCE(read_at,unixepoch()) WHERE id=? AND user_id=?`,id,userId); return Number(r.changes??r.meta?.changes??0)>0; }
export async function markAllNotificationsRead(userId:number){ const r:any=await d1Run(`UPDATE notifications SET read_at=unixepoch() WHERE user_id=? AND read_at IS NULL`,userId); return Number(r.changes??r.meta?.changes??0); }
export async function upsertPushSubscription(userId:number,endpoint:string,p256dh:string,auth:string){
  await d1Run(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=unixepoch()`,userId,endpoint,p256dh,auth);
}
export async function deletePushSubscription(userId:number,endpoint:string){ const r:any=await d1Run(`DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?`,userId,endpoint); return Number(r.changes??r.meta?.changes??0)>0; }
export async function deletePushSubscriptionByEndpoint(endpoint:string){ await d1Run(`DELETE FROM push_subscriptions WHERE endpoint=?`,endpoint); }
export async function claimPendingPushDeliveries(limit:number,leaseUntil:number){
  const token=crypto.randomUUID(); const now=Math.floor(Date.now()/1000);
  await d1Run(`UPDATE push_deliveries SET lease_until=?,lease_token=?,attempt_count=attempt_count+1 WHERE id IN (SELECT id FROM push_deliveries WHERE delivered_at IS NULL AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<?) ORDER BY id LIMIT ?)`,leaseUntil,token,now,now,limit);
  return await d1All(`SELECT d.id delivery_id,s.endpoint,s.p256dh,s.auth,json_object('title',n.title,'body',n.body,'url',COALESCE(n.url,'/'),'tag','notification-'||n.id) payload,d.attempt_count FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id JOIN notifications n ON n.id=d.notification_id WHERE d.lease_token=?`,token) as any[];
}
export async function completePushDelivery(id:number){ await d1Run(`UPDATE push_deliveries SET delivered_at=unixepoch(),lease_until=NULL,lease_token=NULL,last_error=NULL WHERE id=?`,id); }
export async function retryPushDelivery(id:number,nextAttemptAt:number,error:string){ await d1Run(`UPDATE push_deliveries SET next_attempt_at=?,last_error=?,lease_until=NULL,lease_token=NULL WHERE id=?`,nextAttemptAt,error,id); }
export async function generateDailySummaryNotifications(fromTs:number,toTs:number,localDate:string){
  const users:any[]=await d1All(`SELECT id,role FROM users WHERE is_active=1 AND role IN ('tech','sales')`);
  let created=0;
  for(const user of users){
    const row:any=await d1Get(`SELECT COUNT(*) c FROM jobs WHERE status!='cancelled' AND starts_at>=? AND starts_at<? AND ${user.role==='tech'?'tech_id':'booked_by'}=?`,fromTs,toTs,user.id);
    const count=Number(row?.c??0); if(!count) continue;
    const id=await createNotification(user.id,'Today’s schedule',`${count} ${count===1?'job':'jobs'} scheduled today.`, '/', `daily:${localDate}`);
    if(id) created++;
  }
  return created;
}
export async function reconcileJobNotifications(){
  const created:any=await d1Run(`INSERT OR IGNORE INTO notifications(user_id,title,body,url,dedupe_key) SELECT tech_id,'New booking',client_name||' was added to your schedule.','/jobs/'||id,'job:'||id||':created' FROM jobs WHERE created_at >= (SELECT started_at FROM notification_state WHERE id=1)`);
  const events:any[]=await d1All(`SELECT e.job_id,e.actor_id,e.kind,e.to_val,e.created_at,j.tech_id,j.booked_by,j.client_name FROM job_events e JOIN jobs j ON j.id=e.job_id WHERE e.kind IN ('status','completed','reopened') AND e.created_at >= (SELECT started_at FROM notification_state WHERE id=1)`);
  let repaired=Number(created.changes??created.meta?.changes??0);
  for(const event of events){
    for(const userId of new Set([event.tech_id,event.booked_by])){
      if(userId===event.actor_id) continue;
      const label=event.kind==='status'?`status changed to ${event.to_val}`:event.kind==='completed'?'marked complete':'reopened';
      const id=await createNotification(userId,'Booking updated',`${event.client_name}: ${label}`,`/jobs/${event.job_id}`,`job:${event.job_id}:event:${event.kind}:${event.created_at}:${userId}`);
      if(id) repaired++;
    }
  }
  return repaired;
}
export async function getAvailableSlots(techId: number, opts: any={}): Promise<{starts_at:number; ends_at:number}[]>{
  const fromTs = opts.fromTs ?? Math.floor(Date.now()/1000); const horizon = new Date(); horizon.setDate(horizon.getDate()+SLOT_HORIZON_DAYS); const toTs = opts.toTs ?? Math.floor(horizon.getTime()/1000);
  const dur = (opts.durationMin ?? 90)*60; const step=(opts.stepMin ??30)*60; const buf=(opts.bufferMin ??30)*60;
  const templates = await listTemplates(techId);
  const extraBlocks = await listAvailability(techId, fromTs, toTs);
  const availableTemplates = templates.filter((t:any)=> (t.kind ?? 'available') === 'available');
  const unavailableTemplates = templates.filter((t:any)=> t.kind === 'unavailable');
  const expanded: {starts_at:number; ends_at:number}[] = [];
  // DST-safe expansion: available templates into intervals
  if (availableTemplates.length) {
    const cur = new Date(fromTs*1000); cur.setHours(0,0,0,0);
    while (Math.floor(cur.getTime()/1000) < toTs) {
      const dow = cur.getDay();
      const base = Math.floor(cur.getTime()/1000);
      for (const t of availableTemplates) if (t.dow===dow) {
        const s = base + t.start_min*60; const e = base + t.end_min*60;
        if (e<=s) continue;
        const cs = Math.max(s, fromTs); const ce = Math.min(e, toTs);
        if (ce>cs) expanded.push({starts_at: cs, ends_at: ce});
      }
      cur.setDate(cur.getDate()+1);
    }
  }
  for (const b of extraBlocks) expanded.push({starts_at: b.starts_at, ends_at: b.ends_at});
  if (!expanded.length) return [];
  const unavailable = await listUnavailable(techId, fromTs, toTs);
  const jobs = (await listJobs(fromTs-buf, toTs+buf, techId)).filter((j:any)=>j.status!=='cancelled');
  const blocked: {start:number; end:number}[] = [];
  for (const u of unavailable) blocked.push({start: u.starts_at, end: u.ends_at});
  for (const j of jobs) blocked.push({start: j.starts_at-buf, end: j.ends_at+buf});
  // expand unavailable templates into blocked intervals
  if (unavailableTemplates.length) {
    const cur = new Date(fromTs*1000); cur.setHours(0,0,0,0);
    while (Math.floor(cur.getTime()/1000) < toTs) {
      const dow = cur.getDay();
      const base = Math.floor(cur.getTime()/1000);
      for (const t of unavailableTemplates) if (t.dow===dow) {
        const s = base + t.start_min*60; const e = base + t.end_min*60;
        if (e<=s) continue;
        const cs = Math.max(s, fromTs); const ce = Math.min(e, toTs);
        if (ce>cs) blocked.push({start: cs, end: ce});
      }
      cur.setDate(cur.getDate()+1);
    }
  }
  function isBlocked(s:number,e:number){
    for (const b of blocked) if (s < b.end && e > b.start) return true;
    return false;
  }
  // also need to ensure slot is not overlapped by unavailable even partially subtracted — isBlocked already covers.
  // But also need to ensure slot is fully inside a single interval (not spanning gap between two intervals).
  // Our generation iterates per interval, so each slot will be inside its source interval.
  // However unavailable may split an interval — isBlocked handles by rejecting overlapping slots.
  const out:any[]=[]; const seen=new Set<string>();
  const nowSec = Math.floor(Date.now()/1000);
  for(const blk of expanded){
    let s=Math.max(blk.starts_at, fromTs);
    const sDate=new Date(s*1000); const sMin=sDate.getMinutes();
    if(sMin!==0 && sMin!==30){ const bump=30-(sMin%30); s+=bump*60; }
    while(s+dur<=blk.ends_at && s+dur<=toTs){
      const e=s+dur; const key=`${s}-${e}`;
      if(s>=nowSec && !isBlocked(s,e) && !seen.has(key)){ seen.add(key); out.push({starts_at:s, ends_at:e}); }
      s+=step;
    }
  }
  return out;
}
export async function listAllJobsForMap(){ return await d1All(`SELECT j.id, j.client_name, j.address, j.lat, j.lng, j.status, j.starts_at, j.tech_id, t.display_name AS tech_name FROM jobs j JOIN users t ON t.id=j.tech_id WHERE j.lat IS NOT NULL AND j.lng IS NOT NULL ORDER BY j.starts_at`) as any; }
export async function listJobsForMapForTech(techId: number){ return await d1All(`SELECT j.id, j.client_name, j.address, j.lat, j.lng, j.status, j.starts_at, j.tech_id, t.display_name AS tech_name FROM jobs j JOIN users t ON t.id=j.tech_id WHERE j.tech_id = ? AND j.lat IS NOT NULL AND j.lng IS NOT NULL ORDER BY j.starts_at`, techId) as any; }
// Contracts roster: one row per job (a contract is one-per-person on a 3-year term).
export async function listContracts(): Promise<JobWithTech[]> {
  return (await d1All(`SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name FROM jobs j JOIN users t ON t.id=j.tech_id JOIN users b ON b.id=j.booked_by ORDER BY j.client_name COLLATE NOCASE`)) as JobWithTech[];
}

export async function countUnmappedForTech(techId: number): Promise<number> {
  const row = await d1Get(`SELECT COUNT(*) AS c FROM jobs WHERE tech_id = ? AND (lat IS NULL OR lng IS NULL)`, techId);
  return (row as any)?.c ?? 0;
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
