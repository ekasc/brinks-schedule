import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { env } from '$env/dynamic/private';

const DB_PATH = env.DB_PATH || './data/schedule.db';

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const dir = dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (_db) return _db;
  const d = new Database(DB_PATH);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  // schema — Brinks schedule + customer record
  d.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'sales', 'tech')),
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS availability_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tech_id INTEGER NOT NULL,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_avail_tech_starts ON availability_blocks(tech_id, starts_at);

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tech_id INTEGER NOT NULL,
    booked_by INTEGER NOT NULL,
    client_name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat REAL,
    lng REAL,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    -- contract status: sent (contract sent to customer, awaiting signature),
    --                 signed (customer signed, install is on the books),
    --                 cancelled (deal fell through)
    status TEXT NOT NULL DEFAULT 'sent'
      CHECK (status IN ('sent','signed','cancelled')),
    -- install completion timestamp (set by the tech when the work is done; null = not yet)
    completed_at INTEGER,
    notes TEXT,
    -- customer PII
    email TEXT,
    dob TEXT,
    telus_pin TEXT,
    id_type TEXT CHECK (id_type IS NULL OR id_type IN ('dl','passport','bcid','other')),
    id_last4 TEXT,
    emergency_name TEXT,
    emergency_number TEXT,
    emergency_relation TEXT,
    verbal_password TEXT,
    -- TELUS services the customer currently has
    svc_internet INTEGER NOT NULL DEFAULT 0,
    svc_home_phone INTEGER NOT NULL DEFAULT 0,
    svc_tv INTEGER NOT NULL DEFAULT 0,
    -- extras
    themes TEXT,
    security_offered TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_tech_starts ON jobs(tech_id, starts_at);
  CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
`);

  // ── Migrations for older databases ──
  // 1) add completed_at if missing (older schema predates it)
  const hasCompletedAt = d.prepare(`PRAGMA table_info(jobs)`).all().some(c => c.name === 'completed_at');
  if (!hasCompletedAt) {
    d.exec(`ALTER TABLE jobs ADD COLUMN completed_at INTEGER;`);
  }
  // 2) status vocabulary migration: pending/contract_signed/scheduled/done → sent/signed + completed_at
  d.exec(`
    UPDATE jobs SET status = 'sent'   WHERE status = 'pending';
    UPDATE jobs SET status = 'signed' WHERE status IN ('contract_signed', 'scheduled');
    UPDATE jobs SET status = 'signed', completed_at = COALESCE(completed_at, ends_at)
      WHERE status = 'done' AND completed_at IS NULL;
  `);
  _db = d;
  return d;
}
const db = new Proxy({} as Database.Database, {
  get(_, prop) { return (getDb() as any)[prop]; }
});

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'sales' | 'tech';
  display_name: string;
  password_hash?: string;
}

export interface AvailabilityBlock {
  id: number;
  tech_id: number;
  starts_at: number;
  ends_at: number;
  note: string | null;
}

export interface Job {
  id: number;
  tech_id: number;
  booked_by: number;
  client_name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  starts_at: number;
  ends_at: number;
  status: 'sent' | 'signed' | 'cancelled';
  completed_at: number | null;
  notes: string | null;
  email: string | null;
  dob: string | null;
  telus_pin: string | null;
  id_type: 'dl' | 'passport' | 'bcid' | 'other' | null;
  id_last4: string | null;
  emergency_name: string | null;
  emergency_number: string | null;
  emergency_relation: string | null;
  verbal_password: string | null;
  svc_internet: number;
  svc_home_phone: number;
  svc_tv: number;
  themes: string | null;
  security_offered: string | null;
}

export interface JobWithTech extends Job {
  tech_name: string;
  booker_name: string;
}

// ── users ──
export function createUser(username: string, password: string, role: 'admin'|'sales'|'tech', display_name: string): number {
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare(`INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)`)
    .run(username, hash, role, display_name);
  return Number(r.lastInsertRowid);
}
export function findUserByUsername(username: string) {
  return db.prepare(`SELECT * FROM users WHERE username = ?`).get(username) as User | undefined;
}
export function findUserById(id: number) {
  return db.prepare(`SELECT id, username, role, display_name FROM users WHERE id = ?`).get(id) as User | undefined;
}
export function listUsers(role?: 'admin'|'sales'|'tech'): User[] {
  if (role) {
    return db.prepare(`SELECT id, username, role, display_name FROM users WHERE role = ? ORDER BY display_name`).all(role) as User[];
  }
  return db.prepare(`SELECT id, username, role, display_name FROM users ORDER BY role, display_name`).all() as User[];
}
export function verifyPassword(user: User, password: string): boolean {
  if (!user.password_hash) return false;
  return bcrypt.compareSync(password, user.password_hash);
}
export function updatePassword(id: number, password: string) {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hash, id);
}
export function updateDisplayName(id: number, name: string) {
  db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`).run(name, id);
}

// ── availability ──
export function addAvailability(techId: number, startsAt: number, endsAt: number, note: string | null) {
  const r = db.prepare(`INSERT INTO availability_blocks (tech_id, starts_at, ends_at, note) VALUES (?, ?, ?, ?)`)
    .run(techId, startsAt, endsAt, note);
  return Number(r.lastInsertRowid);
}
export function listAvailability(techId: number, fromTs: number, toTs: number) {
  return db.prepare(`
    SELECT * FROM availability_blocks
    WHERE tech_id = ? AND starts_at < ? AND ends_at > ?
    ORDER BY starts_at
  `).all(techId, toTs, fromTs) as AvailabilityBlock[];
}
export function removeAvailability(id: number, techId: number) {
  db.prepare(`DELETE FROM availability_blocks WHERE id = ? AND tech_id = ?`).run(id, techId);
}

// ── jobs ──
export interface NewJob {
  tech_id: number;
  booked_by: number;
  client_name: string;
  address: string;
  starts_at: number;
  ends_at: number;
  notes?: string | null;
  email?: string | null;
  dob?: string | null;
  telus_pin?: string | null;
  id_type?: 'dl'|'passport'|'bcid'|'other' | null;
  id_last4?: string | null;
  emergency_name?: string | null;
  emergency_number?: string | null;
  emergency_relation?: string | null;
  verbal_password?: string | null;
  svc_internet?: boolean;
  svc_home_phone?: boolean;
  svc_tv?: boolean;
  themes?: string | null;
  security_offered?: string | null;
}

export function createJob(j: NewJob): { id: number } | { conflict: 'tech_busy' | 'outside_availability' } {
  // conflict: tech already has a signed job overlapping the slot
  const overlap = db.prepare(`
    SELECT id FROM jobs
    WHERE tech_id = ? AND status = 'signed'
      AND starts_at < ? AND ends_at > ?
    LIMIT 1
  `).get(j.tech_id, j.ends_at, j.starts_at);
  if (overlap) return { conflict: 'tech_busy' };

  // conflict: outside the tech's posted availability (only if a block covers this time at all)
  const blocks = db.prepare(`
    SELECT id FROM availability_blocks
    WHERE tech_id = ? AND starts_at < ? AND ends_at > ?
  `).all(j.tech_id, j.ends_at, j.starts_at);
  if (blocks.length === 0) return { conflict: 'outside_availability' };

  const r = db.prepare(`
    INSERT INTO jobs (
      tech_id, booked_by, client_name, address,
      starts_at, ends_at, notes,
      email, dob, telus_pin, id_type, id_last4,
      emergency_name, emergency_number, emergency_relation, verbal_password,
      svc_internet, svc_home_phone, svc_tv, themes, security_offered
    ) VALUES (
      @tech_id, @booked_by, @client_name, @address,
      @starts_at, @ends_at, @notes,
      @email, @dob, @telus_pin, @id_type, @id_last4,
      @emergency_name, @emergency_number, @emergency_relation, @verbal_password,
      @svc_internet, @svc_home_phone, @svc_tv, @themes, @security_offered
    )
  `).run({
    ...j,
    notes: j.notes ?? null,
    email: j.email ?? null,
    dob: j.dob ?? null,
    telus_pin: j.telus_pin ?? null,
    id_type: j.id_type ?? null,
    id_last4: j.id_last4 ?? null,
    emergency_name: j.emergency_name ?? null,
    emergency_number: j.emergency_number ?? null,
    emergency_relation: j.emergency_relation ?? null,
    verbal_password: j.verbal_password ?? null,
    themes: j.themes ?? null,
    security_offered: j.security_offered ?? null,
    svc_internet: j.svc_internet ? 1 : 0,
    svc_home_phone: j.svc_home_phone ? 1 : 0,
    svc_tv: j.svc_tv ? 1 : 0,
  });
  return { id: Number(r.lastInsertRowid) };
}

export function getJob(id: number): JobWithTech | undefined {
  return db.prepare(`
    SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name
    FROM jobs j
    JOIN users t ON t.id = j.tech_id
    JOIN users b ON b.id = j.booked_by
    WHERE j.id = ?
  `).get(id) as JobWithTech | undefined;
}

export function listJobsForUser(user: { id: number; role: string }, fromTs: number, toTs: number) {
  if (user.role === 'tech') {
    return db.prepare(`
      SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name
      FROM jobs j JOIN users t ON t.id = j.tech_id
      WHERE j.tech_id = ? AND j.starts_at < ? AND j.ends_at > ?
        AND j.status = 'signed'
      ORDER BY j.starts_at
    `).all(user.id, toTs, fromTs) as JobWithTech[];
  }
  return db.prepare(`
    SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name
    FROM jobs j JOIN users t ON t.id = j.tech_id
    WHERE j.starts_at < ? AND j.ends_at > ?
    ORDER BY j.starts_at
  `).all(toTs, fromTs) as JobWithTech[];
}

export function listUpcomingForUser(user: { id: number; role: string }, fromTs: number, limit = 10) {
  if (user.role === 'tech') {
    return db.prepare(`
      SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name
      FROM jobs j JOIN users t ON t.id = j.tech_id
      WHERE j.tech_id = ? AND j.ends_at >= ?
        AND j.status = 'signed'
      ORDER BY j.starts_at
      LIMIT ?
    `).all(user.id, fromTs, limit) as JobWithTech[];
  }
  return db.prepare(`
    SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name
    FROM jobs j JOIN users t ON t.id = j.tech_id
    WHERE j.ends_at >= ?
    ORDER BY j.starts_at
    LIMIT ?
  `).all(fromTs, limit) as JobWithTech[];
}

export function setJobStatus(id: number, status: Job['status']) {
  db.prepare(`UPDATE jobs SET status = ?, updated_at = unixepoch() WHERE id = ?`).run(status, id);
}

export function setJobCompleted(id: number, completed_at: number | null) {
  db.prepare(`UPDATE jobs SET completed_at = ?, updated_at = unixepoch() WHERE id = ?`).run(completed_at, id);
}

export function setJobCoords(id: number, lat: number, lng: number) {
  db.prepare(`UPDATE jobs SET lat = ?, lng = ?, updated_at = unixepoch() WHERE id = ?`).run(lat, lng, id);
}

// "Smart" available-slot generator for a single tech.
// Respects:
//  - availability blocks (only inside)
//  - existing jobs (no overlap with contract_signed/scheduled/done)
//  - 30-min travel buffer before & after each job
//  - job duration (default 1.5h, configurable)
//  - the past (now() forward)
//  - horizon (default: 14 days)
export function getAvailableSlots(
  techId: number,
  opts: { fromTs?: number; toTs?: number; durationMin?: number; stepMin?: number; bufferMin?: number } = {}
): { starts_at: number; ends_at: number; reason?: string }[] {
  const fromTs = opts.fromTs ?? Math.floor(Date.now() / 1000);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  const toTs = opts.toTs ?? Math.floor(horizon.getTime() / 1000);
  const dur = (opts.durationMin ?? 90) * 60;       // 1.5h default
  const step = (opts.stepMin ?? 30) * 60;            // 30-min step
  const buf = (opts.bufferMin ?? 30) * 60;           // 30-min buffer around existing jobs

  // 1. Availability blocks within range
  const blocks = listAvailability(techId, fromTs, toTs);
  if (blocks.length === 0) return [];

  // 2. Existing jobs (with buffer) within range. Only signed jobs block the calendar —
  //    sent or cancelled jobs don't reserve the slot.
  const jobs = listJobs(fromTs - buf, toTs + buf, techId).filter(j => j.status === 'signed');
  // expand each job into a [start-buf, end+buf] blocked interval
  const blocked: { start: number; end: number }[] = jobs.map(j => ({
    start: j.starts_at - buf,
    end: j.ends_at + buf
  }));

  function isBlocked(s: number, e: number): boolean {
    for (const b of blocked) {
      if (s < b.end && e > b.start) return true;
    }
    return false;
  }

  // 3. Generate candidate slots inside each block
  const out: { starts_at: number; ends_at: number }[] = [];
  for (const blk of blocks) {
    let s = Math.max(blk.starts_at, fromTs);
    // align s to a 30-min boundary so slots look tidy
    const sDate = new Date(s * 1000);
    const sMin = sDate.getMinutes();
    if (sMin !== 0 && sMin !== 30) {
      const bump = 30 - (sMin % 30);
      s += bump * 60;
    }
    while (s + dur <= blk.ends_at && s + dur <= toTs) {
      const e = s + dur;
      if (s >= Math.floor(Date.now() / 1000) && !isBlocked(s, e)) {
        out.push({ starts_at: s, ends_at: e });
      }
      s += step;
    }
  }

  return out;
}

export function listAllJobsForMap() {
  return db.prepare(`
    SELECT j.id, j.client_name, j.address, j.lat, j.lng, j.status, j.starts_at,
           t.display_name AS tech_name
    FROM jobs j JOIN users t ON t.id = j.tech_id
    WHERE j.lat IS NOT NULL AND j.lng IS NOT NULL
    ORDER BY j.starts_at
  `).all() as { id: number; client_name: string; address: string; lat: number; lng: number; status: string; starts_at: number; tech_name: string }[];
}

// legacy: used by home/calendar/availability pages that already filter by tech on the consumer side
export function listJobs(fromTs: number, toTs: number, techId?: number) {
  if (techId != null) {
    return db.prepare(`
      SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name
      FROM jobs j
        JOIN users t ON t.id = j.tech_id
        JOIN users b ON b.id = j.booked_by
      WHERE j.tech_id = ? AND j.starts_at < ? AND j.ends_at > ?
      ORDER BY j.starts_at
    `).all(techId, toTs, fromTs) as JobWithTech[];
  }
  return db.prepare(`
    SELECT j.*, t.display_name AS tech_name, b.display_name AS booker_name
    FROM jobs j
      JOIN users t ON t.id = j.tech_id
      JOIN users b ON b.id = j.booked_by
    WHERE j.starts_at < ? AND j.ends_at > ?
    ORDER BY j.starts_at
  `).all(toTs, fromTs) as JobWithTech[];
}

// travel-time helper (haversine, km)
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const x = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
