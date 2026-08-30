#!/usr/bin/env node
// Online, WAL-safe backup of the schedule SQLite database.
//
// Usage:
//   DB_PATH=./data/schedule.db BACKUP_DIR=./backups node scripts/backup-db.mjs
//
// Schedule with cron (daily at 02:17), keeping the last 14 snapshots:
//   17 2 * * * cd /app && DB_PATH=/app/data/schedule.db BACKUP_DIR=/app/backups \
//     JWT_SECRET=... node scripts/backup-db.mjs >> /app/backups/cron.log 2>&1
//
// Uses better-sqlite3's backup() API, which streams a consistent snapshot even
// while the app is writing (it reads through the WAL), so no downtime is needed.
import Database from 'better-sqlite3';
import { mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { env } from 'node:process';

const DB = env.DB_PATH || './data/schedule.db';
const BACKUP_DIR = env.BACKUP_DIR || './backups';
const KEEP = Math.max(1, Number(env.BACKUP_KEEP || 14));

if (!existsSync(DB)) {
  console.error(`[backup] DB not found at ${DB}`);
  process.exit(1);
}
mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = `${BACKUP_DIR}/schedule-${stamp}.db`;

const db = new Database(DB, { readonly: true, fileMustExist: true });
try {
  await db.backup(out);
} finally {
  db.close();
}

// Prune to the most recent KEEP snapshots.
const files = readdirSync(BACKUP_DIR)
  .filter((f) => f.startsWith('schedule-') && f.endsWith('.db'))
  .map((f) => ({ f, t: statSync(`${BACKUP_DIR}/${f}`).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const { f } of files.slice(KEEP)) rmSync(`${BACKUP_DIR}/${f}`);

console.log(`[backup] wrote ${out} (keeping ${Math.min(files.length, KEEP)} latest)`);
