import { describe, test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let db;
let schema;
let tmpDir;
let dbPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-crud-'));
  dbPath = join(tmpDir, 'test.db');
  db = await import('$lib/server/db');
  schema = await import('$lib/server/schema');
  db.__setTestDbPath(dbPath);
});

afterAll(() => {
  try { db.__setTestDbPath(null); } catch {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  assert.ok(!dbPath.includes('data/schedule.db'));
});

const OLD_JOBS_DDL =
  `CREATE TABLE jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, booked_by INTEGER NOT NULL, client_name TEXT NOT NULL, address TEXT NOT NULL, street TEXT, city TEXT, province TEXT, postal_code TEXT, lat REAL, lng REAL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','cancelled')), completed_at INTEGER, notes TEXT, email TEXT, dob TEXT, telus_pin TEXT, id_type TEXT, id_last4 TEXT, emergency_name TEXT, emergency_number TEXT, emergency_relation TEXT, verbal_password TEXT, svc_internet INTEGER NOT NULL DEFAULT 0, svc_internet_detail TEXT, svc_home_phone INTEGER NOT NULL DEFAULT 0, svc_home_phone_detail TEXT, svc_tv INTEGER NOT NULL DEFAULT 0, svc_tv_detail TEXT, themes TEXT, security_offered TEXT, phone TEXT, price_cents INTEGER NOT NULL DEFAULT 0, payout_cents INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))`;

describe('declined migration builders', () => {
  test('jobsNeedsDeclinedMigration detects old vs new DDL', () => {
    assert.equal(schema.jobsNeedsDeclinedMigration(null), false);
    assert.equal(schema.jobsNeedsDeclinedMigration(undefined), false);
    assert.equal(schema.jobsNeedsDeclinedMigration(OLD_JOBS_DDL), true);
    assert.equal(
      schema.jobsNeedsDeclinedMigration(OLD_JOBS_DDL.replace(`'cancelled'`, `'cancelled','declined'`)),
      false
    );
  });
  test('buildJobsDeclinedMigration derives statements from live DDL', () => {
    const cols = ['id', 'tech_id', 'status', 'client_name'];
    const stmts = schema.buildJobsDeclinedMigration(OLD_JOBS_DDL, cols);
    assert.ok(stmts);
    assert.match(stmts[0], /DROP TABLE IF EXISTS jobs_new/);
    assert.match(stmts[1], /CREATE TABLE jobs_new/);
    assert.ok(stmts[1].includes(`'declined'`));
    assert.ok(stmts[2].startsWith('INSERT INTO jobs_new'));
    assert.ok(stmts.includes('DROP TABLE jobs;'));
    assert.ok(stmts.includes('ALTER TABLE jobs_new RENAME TO jobs;'));
    assert.equal(stmts.filter((s) => s.startsWith('CREATE INDEX')).length, 3);
  });
  test('buildJobsDeclinedMigration aborts on unrecognized DDL or columns', () => {
    assert.equal(schema.buildJobsDeclinedMigration('CREATE TABLE widgets (id INTEGER)', ['id']), null);
    assert.equal(schema.buildJobsDeclinedMigration(OLD_JOBS_DDL, []), null);
    assert.equal(schema.buildJobsDeclinedMigration(OLD_JOBS_DDL, ['id; DROP TABLE users;--']), null);
  });
});

describe('declined migration on a real database', () => {
  test('old table migrates with data intact and declined becomes writable', async () => {
    const Database = (await import('better-sqlite3')).default;
    const path = join(tmpDir, 'legacy.db');
    const direct = new Database(path);
    try {
      direct.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 1);`);
      direct.exec(OLD_JOBS_DDL);
      direct.prepare(`INSERT INTO users (username, password_hash, role, display_name) VALUES ('t','h','tech','T')`).run();
      direct.prepare(`INSERT INTO users (username, password_hash, role, display_name) VALUES ('s','h','sales','S')`).run();
      direct.prepare(`INSERT INTO jobs (tech_id, booked_by, client_name, address, starts_at, ends_at, status) VALUES (1, 2, 'Keep Me', '1 Main St', 100, 200, 'sent')`).run();
      schema.initializeSqliteSchema(direct);
      const row = direct.prepare(`SELECT * FROM jobs WHERE id = 1`).get();
      assert.equal(row.client_name, 'Keep Me');
      assert.equal(row.status, 'sent');
      direct.prepare(`UPDATE jobs SET status = 'declined' WHERE id = 1`).run();
      assert.equal(direct.prepare(`SELECT status FROM jobs WHERE id = 1`).get().status, 'declined');
      // idempotent: second run is a no-op and keeps working
      schema.initializeSqliteSchema(direct);
      assert.equal(direct.prepare(`SELECT COUNT(*) c FROM jobs`).get().c, 1);
    } finally {
      direct.close();
    }
  });
});

async function mkUser(role, name) {
  return db.createUser(`${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123', role, name);
}

function tomorrowParts() {
  const p = db.getVancouverParts(Math.floor(Date.now() / 1000) + 86400);
  return { y: p.year, m: p.month, d: p.day, dow: p.dow };
}

async function book(techId, salesId, y, m, d, sh, eh) {
  const starts_at = db.vancouverWallToEpoch(y, m, d, sh, 0);
  const ends_at = db.vancouverWallToEpoch(y, m, d, eh, 0);
  const res = await db.createJob({
    tech_id: techId, booked_by: salesId, client_name: 'Crud Client',
    address: '1 Main St, Vancouver, BC V6A 1A1', starts_at, ends_at
  });
  assert.ok(!('conflict' in res), `setup booking failed: ${JSON.stringify(res)}`);
  return { id: res.id, starts_at, ends_at };
}

describe('declined status semantics', () => {
  test('declined neither blocks the calendar nor appears in slot blocking', async () => {
    const tech = await mkUser('tech', 'Decline Tech');
    const sales = await mkUser('sales', 'Decline Sales');
    const { y, m, d, dow } = tomorrowParts();
    await db.setPatternsForTech(tech, [{ dow, start_min: 540, end_min: 1020 }]);

    const a = await book(tech, sales, y, m, d, 10, 11);
    assert.deepEqual(await db.setJobStatus(a.id, 'declined', sales), { ok: true });

    // Overlapping booking succeeds — declined does not block.
    const b = await book(tech, sales, y, m, d, 10, 11);

    // Sanity: a second overlapping booking still conflicts (blocking intact).
    const cStart = db.vancouverWallToEpoch(y, m, d, 10, 0);
    const cEnd = db.vancouverWallToEpoch(y, m, d, 11, 0);
    const clash = await db.createJob({
      tech_id: tech, booked_by: sales, client_name: 'Clash',
      address: '2 Main St, Vancouver, BC V6A 1A1', starts_at: cStart, ends_at: cEnd
    });
    assert.equal(clash.conflict, 'tech_busy');

    // Restoring the declined job into the now-taken slot conflicts…
    const restore = await db.setJobStatus(a.id, 'sent', sales);
    assert.ok('conflict' in restore);

    // …but succeeds once the slot is free, and declined restores like cancelled.
    assert.deepEqual(await db.setJobStatus(b.id, 'cancelled', sales), { ok: true });
    assert.deepEqual(await db.setJobStatus(a.id, 'sent', sales), { ok: true });
    const again = await db.getJob(a.id);
    assert.equal(again.status, 'sent');
  });
});

describe('updateJob extended fields + deleteJob', () => {
  test('phone/price update, notes-only edit skips scheduling enforcement, delete removes', async () => {
    const tech = await mkUser('tech', 'Edit Tech');
    const sales = await mkUser('sales', 'Edit Sales');
    const { y, m, d, dow } = tomorrowParts();
    await db.setPatternsForTech(tech, [{ dow, start_min: 540, end_min: 1020 }]);

    const a = await book(tech, sales, y, m, d, 10, 11);
    assert.deepEqual(
      await db.updateJob(a.id, { phone: '+1 604-555-0100', price_cents: 12999, notes: 'gate code 123' }, sales),
      { ok: true }
    );
    const updated = await db.getJob(a.id);
    assert.equal(updated.phone, '+1 604-555-0100');
    assert.equal(updated.price_cents, 12999);
    assert.equal(updated.notes, 'gate code 123');

    // Hours removed since booking: a notes-only edit must still succeed
    // (scheduling fields are only enforced when they change).
    await db.setPatternsForTech(tech, []);
    assert.deepEqual(await db.updateJob(a.id, { notes: 'new note' }, sales), { ok: true });

    await db.deleteJob(a.id);
    assert.equal(await db.getJob(a.id), undefined);
    assert.deepEqual(await db.listJobsSummary(a.starts_at - 10, a.ends_at + 10, tech), []);
  });
});

describe('declined counts in stats', () => {
  test('income, system and team aggregates report declined separately', async () => {
    const tech = await mkUser('tech', 'Stats Tech');
    const sales = await mkUser('sales', 'Stats Sales');
    const { y, m, d, dow } = tomorrowParts();
    await db.setPatternsForTech(tech, [{ dow, start_min: 540, end_min: 1020 }]);
    const before = await db.getSystemStats();
    const a = await book(tech, sales, y, m, d, 10, 11);
    await db.setJobStatus(a.id, 'declined', sales);

    const sys = await db.getSystemStats();
    assert.equal(sys.declined, (before.declined ?? 0) + 1);
    assert.equal(sys.total, before.total + 1);

    const me = await db.getIncomeForUser(sales, 'sales');
    assert.equal(me.declined, 1);
    assert.equal(me.total, 1);

    const team = await db.getTeamStats();
    const row = team.find((u) => u.id === tech);
    assert.equal(row.declined, 1);
  });
});

describe('notifyJobEdited', () => {
  test('notifies tech and booker minus the actor, deduped per save', async () => {
    const notif = await import('$lib/server/notifications');
    const tech = await mkUser('tech', 'NotifyEdit Tech');
    const sales = await mkUser('sales', 'NotifyEdit Sales');
    const job = { id: 424242, tech_id: tech, booked_by: sales, client_name: 'Edit Me', updated_at: 777 };

    assert.equal(await notif.notifyJobEdited(job, sales), 1);
    const techRows = await db.listNotifications(tech, 10);
    assert.equal(techRows.length, 1);
    assert.equal(techRows[0].url, '/jobs/424242');
    assert.match(techRows[0].body, /details edited/);
    assert.deepEqual(await db.listNotifications(sales, 10), []);

    // Same updated_at = same save = no duplicate row.
    await notif.notifyJobEdited(job, sales);
    assert.equal((await db.listNotifications(tech, 10)).length, 1);
  });
});

describe('reconcile watermark + prune', () => {
  test('watermark advances on reconcile without blinding new events', async () => {
    const tech = await mkUser('tech', 'Watermark Tech');
    const sales = await mkUser('sales', 'Watermark Sales');
    const { y, m, d, dow } = tomorrowParts();
    await db.setPatternsForTech(tech, [{ dow, start_min: 540, end_min: 1020 }]);
    const w0 = await db.__getNotificationWatermark();
    assert.ok(w0 > 0);

    const a = await book(tech, sales, y, m, d, 10, 11);
    await db.setJobStatus(a.id, 'signed', sales);
    const repaired = await db.reconcileJobNotifications();
    assert.ok(repaired >= 1);
    const w1 = await db.__getNotificationWatermark();
    assert.ok(w1 >= w0);
    assert.ok(Date.now() / 1000 - w1 < 60);

    // A later event is still repaired (same-second edge covered by >=).
    await db.setJobStatus(a.id, 'cancelled', sales);
    assert.ok((await db.reconcileJobNotifications()) >= 1);
    // Repeat with nothing new repairs nothing.
    assert.equal(await db.reconcileJobNotifications(), 0);
  });

  test('prune deletes only old read notifications', async () => {
    const tech = await mkUser('tech', 'Prune Tech');
    const keep = await db.createNotification(tech, 'Keep', 'unread', '/', `prune:keep:${Date.now()}`);
    const drop = await db.createNotification(tech, 'Drop', 'read', '/', `prune:drop:${Date.now()}`);
    assert.ok(keep > 0 && drop > 0);
    assert.equal(await db.markNotificationRead(drop, tech), true);
    assert.equal(await db.pruneOldNotifications(0), 1);
    const rows = await db.listNotifications(tech, 10);
    assert.deepEqual(rows.map((r) => r.id), [keep]);
  });
});

describe('completion guards', () => {
  test('complete requires signed; cancelling clears completed_at', async () => {
    const tech = await mkUser('tech', 'Complete Tech');
    const sales = await mkUser('sales', 'Complete Sales');
    const { y, m, d, dow } = tomorrowParts();
    await db.setPatternsForTech(tech, [{ dow, start_min: 540, end_min: 1020 }]);
    const a = await book(tech, sales, y, m, d, 10, 11);

    const early = await db.setJobCompleted(a.id, Math.floor(Date.now() / 1000), sales);
    assert.ok('conflict' in early);

    assert.deepEqual(await db.setJobStatus(a.id, 'signed', sales), { ok: true });
    assert.deepEqual(await db.setJobCompleted(a.id, Math.floor(Date.now() / 1000), sales), { ok: true });
    assert.ok((await db.getJob(a.id)).completed_at != null);

    assert.deepEqual(await db.setJobStatus(a.id, 'cancelled', sales), { ok: true });
    const after = await db.getJob(a.id);
    assert.equal(after.status, 'cancelled');
    assert.equal(after.completed_at, null);
  });
});
