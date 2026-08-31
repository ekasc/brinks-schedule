import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = '/tmp/brinks-test-e2e.db';

function seed() {
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'sales', 'tech')),
      display_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login INTEGER,
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
    CREATE TABLE IF NOT EXISTS availability_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tech_id INTEGER NOT NULL,
      dow INTEGER NOT NULL,
      start_min INTEGER NOT NULL,
      end_min INTEGER NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE
    );
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
      status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','cancelled')),
      completed_at INTEGER,
      notes TEXT,
      email TEXT,
      dob TEXT,
      telus_pin TEXT,
      id_type TEXT CHECK (id_type IS NULL OR id_type IN ('dl','passport','bcid','other')),
      id_last4 TEXT,
      emergency_name TEXT,
      emergency_number TEXT,
      emergency_relation TEXT,
      verbal_password TEXT,
      svc_internet INTEGER NOT NULL DEFAULT 0,
      svc_home_phone INTEGER NOT NULL DEFAULT 0,
      svc_tv INTEGER NOT NULL DEFAULT 0,
      themes TEXT,
      security_offered TEXT,
      payout_cents INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      actor_id INTEGER,
      kind TEXT NOT NULL,
      from_val TEXT,
      to_val TEXT,
      note TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS pii_access_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      accessor_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const users: [string, string, string, string][] = [
    ['admin', 'changeme', 'admin', 'Admin'],
    ['admin_esc', 'changeme', 'admin', 'Admin (esc)'],
    ['ekas', 'changeme', 'sales', 'Ekas'],
    ['raman', 'changeme', 'sales', 'Raman'],
    ['tech1', 'changeme', 'tech', 'Tech 1'],
    ['tech2', 'changeme', 'tech', 'Tech 2'],
  ];

  const ins = db.prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)');
  for (const [u, pw, role, name] of users) {
    const hash = bcrypt.hashSync(pw, 10);
    ins.run(u, hash, role, name);
  }

  const tech1 = db.prepare('SELECT id FROM users WHERE username = ?').get('tech1') as { id: number };
  const tech2 = db.prepare('SELECT id FROM users WHERE username = ?').get('tech2') as { id: number };

  const now = Math.floor(Date.now() / 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = Math.floor(today.getTime() / 1000);

  const blockIns = db.prepare('INSERT INTO availability_blocks (tech_id, starts_at, ends_at, note) VALUES (?, ?, ?, ?)');
  for (let d = 0; d < 14; d++) {
    const dayStart = todayStart + d * 86400;
    blockIns.run(tech1.id, dayStart + 9 * 3600, dayStart + 17 * 3600, 'e2e block');
    blockIns.run(tech2.id, dayStart + 9 * 3600, dayStart + 17 * 3600, 'e2e block');
  }

  console.log(`[global-setup] seeded ${DB_PATH} with ${users.length} users + 14 days availability`);
  db.close();
}

export default async function globalSetup() {
  seed();
}
