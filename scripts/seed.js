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

  CREATE TABLE IF NOT EXISTS availability_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, dow INTEGER NOT NULL CHECK (dow >=0 AND dow <=6), start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
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
    id_type TEXT,
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

const users = Object.fromEntries(
  db.prepare(`SELECT id, username FROM users`).all().map((user) => [user.username, user.id])
);

function localTimestamp(dayOffset, hour, minute = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

const dummyJobs = [
  ['Maya Singh', '412 W 8th Ave, Vancouver', 0, 9, 0, 90, 'signed', 'tech1', 18000, 49.2635, -123.1148],
  ['Noah Williams', '1285 Pender St W, Vancouver', 0, 11, 0, 120, 'signed', 'tech2', 22000, 49.2883, -123.1244],
  ['Ava Chen', '88 Lonsdale Ave, North Vancouver', 0, 14, 0, 90, 'sent', 'tech1', 16000, 49.3121, -123.0794],
  ['Liam Patel', '733 Marine Dr, North Vancouver', 1, 9, 30, 120, 'signed', 'tech2', 24000, 49.3224, -123.0986],
  ['Sophia Martin', '4500 Kingsway, Burnaby', 1, 13, 0, 90, 'signed', 'tech1', 19000, 49.2293, -123.0063],
  ['Ethan Wilson', '610 6th St, New Westminster', 2, 10, 0, 120, 'signed', 'tech1', 25000, 49.2103, -122.9226],
  ['Isabella Brown', '1033 Austin Ave, Coquitlam', 2, 14, 30, 90, 'cancelled', 'tech2', 17000, 49.2485, -122.8672],
  ['Lucas Garcia', '152 St & 104 Ave, Surrey', 3, 9, 0, 180, 'signed', 'tech2', 30000, 49.1913, -122.8011],
  ['Amelia Johnson', '800 Robson St, Vancouver', 3, 13, 30, 90, 'sent', 'tech1', 18000, 49.2814, -123.1192],
  ['Oliver Lee', '555 W 12th Ave, Vancouver', 4, 10, 0, 120, 'signed', 'tech1', 22000, 49.2612, -123.1165],
  ['Mia Thompson', '1200 Lynn Valley Rd, North Vancouver', 4, 14, 0, 120, 'signed', 'tech2', 23000, 49.3369, -123.0387],
  ['Elijah Davis', '4700 Kingsway, Burnaby', 5, 11, 0, 90, 'signed', 'tech2', 19000, 49.2276, -122.9992],
  ['Charlotte Moore', '1499 Marine Dr, West Vancouver', 6, 10, 30, 120, 'signed', 'tech1', 26000, 49.3288, -123.1582]
];

const seedDummyData = db.transaction(() => {
  db.prepare(`DELETE FROM jobs WHERE email LIKE '%@example.test'`).run();


  const insertTemplate = db.prepare(`INSERT OR IGNORE INTO availability_templates (tech_id, dow, start_min, end_min) VALUES (?, ?, ?, ?)`);
  for (const dow of [1,2,3,4,5]) {
    insertTemplate.run(users.tech1, dow, 8*60, 17*60);
    insertTemplate.run(users.tech2, dow, 9*60, 18*60);
  }

  const insertJob = db.prepare(`
    INSERT INTO jobs (
      tech_id, booked_by, client_name, address, lat, lng, starts_at, ends_at,
      status, notes, email, dob, telus_pin, id_type, id_last4,
      emergency_name, emergency_number, emergency_relation, verbal_password,
      svc_internet, svc_home_phone, svc_tv, themes, security_offered, payout_cents
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  for (const [index, job] of dummyJobs.entries()) {
    const [name, address, day, hour, minute, duration, status, tech, payout, lat, lng] = job;
    const startsAt = localTimestamp(day, hour, minute);
    insertJob.run(
      users[tech], users.ekas, name, address, lat, lng, startsAt, startsAt + duration * 60,
      status, 'Development seed job', `${name.toLowerCase().replaceAll(' ', '.')}@example.test`,
      '1990-05-15', String(4100 + index), 'dl', String(7300 + index),
      'Jordan Example', '604-555-0100', 'Partner', 'cedar',
      index % 2, Number(index % 3 === 0), Number(index % 2 === 0), 'Sports and movies',
      'Smart camera, door sensor, and monitored alarm', payout
    );
  }
});
seedDummyData();

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
