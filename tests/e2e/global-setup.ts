import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { initializeSqliteSchema } from '../../src/lib/server/schema';

const DB_PATH = process.env.DB_PATH || '/tmp/brinks-test-e2e.db';

export default async function globalSetup() {
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Single schema source — same as production (db.ts via schema.ts)
  initializeSqliteSchema(db);

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = Math.floor(today.getTime() / 1000);

  const blockIns = db.prepare('INSERT INTO availability_blocks (tech_id, starts_at, ends_at, note) VALUES (?, ?, ?, ?)');
  for (let d = 0; d < 14; d++) {
    const dayStart = todayStart + d * 86400;
    blockIns.run(tech1.id, dayStart + 9 * 3600, dayStart + 17 * 3600, 'e2e block');
    blockIns.run(tech2.id, dayStart + 9 * 3600, dayStart + 17 * 3600, 'e2e block');
  }

  console.log(`[global-setup] seeded ${DB_PATH} via app schema with ${users.length} users + 14 days availability`);
  db.close();
}
