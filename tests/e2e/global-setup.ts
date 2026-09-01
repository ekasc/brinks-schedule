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

  // Weekly Hours is the sole source of truth. Seed one slot per weekday (Mon-Fri 09:00-17:00)
  // for both techs so /book has slots without relying on the retired availability_blocks.
  const tmplIns = db.prepare('INSERT INTO availability_templates (tech_id, dow, start_min, end_min, kind) VALUES (?, ?, ?, ?, ?)') ;
  for (const tech of [tech1, tech2]) {
    for (const dow of [1, 2, 3, 4, 5]) {
      tmplIns.run(tech.id, dow, 9 * 60, 17 * 60, 'available');
    }
  }

  console.log(`[global-setup] seeded ${DB_PATH} via app schema with ${users.length} users + Mon-Fri 09-17 templates`);
  db.close();
}
