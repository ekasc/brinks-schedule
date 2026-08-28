import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'schedule.db');

const dir = path.dirname(DB_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

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
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

function upsertUser(username, password, role, displayName) {
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare(`
    INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash,
      role = excluded.role,
      display_name = excluded.display_name
  `).run(username, hash, role, displayName);
  return r.changes > 0;
}

// ekas: demoted to sales
upsertUser('ekas', 'changeme', 'sales', 'Ekas');
// two new admins
upsertUser('admin', 'changeme', 'admin', 'Admin');
upsertUser('admin_esc', 'changeme', 'admin', 'Admin (esc)');
// existing sales + techs
upsertUser('raman', 'changeme', 'sales', 'Raman');
upsertUser('tech1', 'changeme', 'tech', 'Tech 1');
upsertUser('tech2', 'changeme', 'tech', 'Tech 2');

const all = db.prepare(`SELECT username, role, display_name FROM users ORDER BY role, username`).all();
console.log('\nCurrent users:');
for (const u of all) console.log(`  ${u.username.padEnd(12)} ${u.role.padEnd(7)} ${u.display_name}`);

console.log('\nLogins at http://192.168.1.94:8766/login (or the public tunnel):');
console.log('  admin / changeme      (admin)');
console.log('  admin_esc / changeme  (admin)');
console.log('  ekas / changeme       (sales)');
console.log('  raman / changeme      (sales)');
console.log('  tech1 / changeme      (tech)');
console.log('  tech2 / changeme      (tech)');

db.close();
