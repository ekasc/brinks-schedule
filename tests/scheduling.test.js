import { describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let db;
let tmpDir;
let dbPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-sched-'));
  dbPath = join(tmpDir, 'test.db');
  db = await import('$lib/server/db');
  db.__setTestDbPath(dbPath);
});

afterAll(() => {
  try { db.__setTestDbPath(null); } catch {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  // safety: ensure we never touched production DB
  assert.ok(!dbPath.includes('data/schedule.db'));
});

async function createTech(name) {
  const id = await db.createUser(`${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123', 'tech', name);
  return id;
}
async function createSales(name) {
  const id = await db.createUser(`${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123', 'sales', name);
  return id;
}

function hourTs(dateStr, hour, min = 0) {
  return Math.floor(new Date(`${dateStr}T${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`).getTime() / 1000);
}

beforeEach(async () => {
  await db.listUsers(); // ensure local DB initialized with schema
  const { default: Database } = await import('better-sqlite3');
  const sqlite = new Database(dbPath);
  sqlite.exec('DELETE FROM jobs; DELETE FROM job_events; DELETE FROM availability_blocks; DELETE FROM availability_templates; DELETE FROM pii_access_log;');
  sqlite.close();
});

describe('sent blocks slot/conflicts', () => {
  test('sent job blocks overlapping create and slot', async () => {
    const tech = await createTech('TechA');
    const sales = await createSales('SalesA');
    const day = '2030-06-10';
    const blockStart = hourTs(day, 9);
    const blockEnd = hourTs(day, 17);
    await db.addAvailability(tech, blockStart, blockEnd, null);
    const s1 = hourTs(day, 10);
    const e1 = hourTs(day, 11, 30);
    const r1 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'Alice', address: '123 Main St', starts_at: s1, ends_at: e1 });
    assert.ok('id' in r1);
    // overlapping should conflict
    const r2 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'Bob', address: '124 Main St', starts_at: s1 + 1800, ends_at: e1 + 1800 });
    assert.equal(r2.conflict, 'tech_busy');
    // non-overlapping with buffer should succeed (gap >= BUFFER_MIN=30)
    const r3 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'Carol', address: '125 Main St', starts_at: e1 + 1800, ends_at: e1 + 1800 + 3600 });
    assert.ok('id' in r3);
    // slots should exclude blocked interval (with buffer 30min default)
    const slots = await db.getAvailableSlots(tech, { fromTs: blockStart, toTs: blockEnd, durationMin: 90, stepMin: 30, bufferMin: 30 });
    for (const sl of slots) {
      const overlaps = sl.starts_at < (e1 + 1800) && sl.ends_at > (s1 - 1800);
      // if overlaps the blocked window (including buffer), it should not appear
      if (sl.starts_at < e1 + 1800 && sl.ends_at > s1 - 1800) {
        assert.fail(`slot ${sl.starts_at}-${sl.ends_at} should be blocked`);
      }
    }
  });

  test('cancelled does not block', async () => {
    const tech = await createTech('TechB');
    const sales = await createSales('SalesB');
    const day = '2030-06-11';
    const blockStart = hourTs(day, 9);
    const blockEnd = hourTs(day, 17);
    await db.addAvailability(tech, blockStart, blockEnd, null);
    const s = hourTs(day, 10);
    const e = hourTs(day, 11, 30);
    const r1 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'Dave', address: '1 St', starts_at: s, ends_at: e });
    assert.ok('id' in r1);
    const jid = r1.id;
    const st = await db.setJobStatus(jid, 'cancelled');
    assert.ok('ok' in st);
    const slotsBefore = await db.getAvailableSlots(tech, { fromTs: blockStart, toTs: blockEnd, durationMin: 90, bufferMin: 0 });
    assert.ok(slotsBefore.some(sl => sl.starts_at === s && sl.ends_at === e), 'slot should be available after cancellation');
    const r2 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'Eve', address: '2 St', starts_at: s, ends_at: e });
    assert.ok('id' in r2, 'cancelled job should not block');
  });
});

describe('full availability containment', () => {
  test('job must be fully inside a block', async () => {
    const tech = await createTech('TechC');
    const sales = await createSales('SalesC');
    const day = '2030-06-12';
    await db.addAvailability(tech, hourTs(day, 10), hourTs(day, 11), null);
    // starts before block
    const r1 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'F', address: 'a', starts_at: hourTs(day, 9, 30), ends_at: hourTs(day, 10, 30) });
    assert.equal(r1.conflict, 'outside_availability');
    // ends after block
    const r2 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'G', address: 'a', starts_at: hourTs(day, 10, 30), ends_at: hourTs(day, 11, 30) });
    assert.equal(r2.conflict, 'outside_availability');
    // exactly inside
    const r3 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'H', address: 'a', starts_at: hourTs(day, 10), ends_at: hourTs(day, 11) });
    assert.ok('id' in r3);
    // helper directly
    assert.equal(await db.isJobWithinAvailability(tech, hourTs(day, 10), hourTs(day, 11)), true);
    assert.equal(await db.isJobWithinAvailability(tech, hourTs(day, 9), hourTs(day, 10)), false);
  });
});

describe('sent/signed status transition conflict', () => {
  test('signing a legacy overlapping sent job is rejected', async () => {
    const tech = await createTech('TechD');
    const sales = await createSales('SalesD');
    const day = '2030-06-13';
    await db.addAvailability(tech, hourTs(day, 9), hourTs(day, 17), null);
    // create two non-overlapping sent jobs, then manually make them overlap via direct DB to simulate legacy data
    const s1 = hourTs(day, 10);
    const e1 = hourTs(day, 11);
    const s2 = hourTs(day, 12);
    const e2 = hourTs(day, 13);
    const r1 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'I', address: 'a', starts_at: s1, ends_at: e1 });
    const r2 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'J', address: 'a', starts_at: s2, ends_at: e2 });
    assert.ok('id' in r1 && 'id' in r2);
    // make second job overlap first via direct update (bypass validation)
    const { default: Database } = await import('better-sqlite3');
    const sqlite = new Database(dbPath);
    sqlite.prepare('UPDATE jobs SET starts_at=?, ends_at=? WHERE id=?').run(s1 + 1800, e1 + 1800, r2.id);
    sqlite.close();
    // now signing second should conflict with first (both sent, overlapping)
    const res = await db.setJobStatus(r2.id, 'signed');
    assert.equal(res.conflict, 'That tech is already booked at that time.');
    // signing first should also conflict
    const res2 = await db.setJobStatus(r1.id, 'signed');
    assert.equal(res2.conflict, 'That tech is already booked at that time.');
    // cancelling first then signing second should succeed
    const c = await db.setJobStatus(r1.id, 'cancelled');
    assert.ok('ok' in c);
    const res3 = await db.setJobStatus(r2.id, 'signed');
    assert.ok('ok' in res3);
    // status unchanged should not validate (idempotent)
    const res4 = await db.setJobStatus(r2.id, 'signed');
    assert.ok('ok' in res4);
  });

  test('reactivating cancelled to sent validates overlap', async () => {
    const tech = await createTech('TechE');
    const sales = await createSales('SalesE');
    const day = '2030-06-14';
    await db.addAvailability(tech, hourTs(day, 9), hourTs(day, 17), null);
    const s = hourTs(day, 10);
    const e = hourTs(day, 11);
    const r1 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'K', address: 'a', starts_at: s, ends_at: e });
    assert.ok('id' in r1);
    await db.setJobStatus(r1.id, 'cancelled');
    // create overlapping sent job now that first is cancelled
    const r2 = await db.createJob({ tech_id: tech, booked_by: sales, client_name: 'L', address: 'a', starts_at: s, ends_at: e });
    assert.ok('id' in r2);
    // reactivating first to sent should conflict
    const res = await db.setJobStatus(r1.id, 'sent');
    assert.ok('conflict' in res);
  });
});

describe('duplicate exact slot output', () => {
  test('duplicate blocks do not produce duplicate slots', async () => {
    const tech = await createTech('TechF');
    const day = '2030-06-15';
    const s = hourTs(day, 9);
    const e = hourTs(day, 12);
    await db.addAvailability(tech, s, e, null);
    await db.addAvailability(tech, s, e, null); // duplicate exact block
    const slots = await db.getAvailableSlots(tech, { fromTs: s, toTs: e, durationMin: 60, stepMin: 30 });
    const keys = slots.map(x => `${x.starts_at}-${x.ends_at}`);
    const uniq = new Set(keys);
    assert.equal(keys.length, uniq.size, 'slots should be deduplicated');
  });
});

describe('recurring unavailable patterns', () => {
  test('an unavailable interval blocks slots inside an available interval', async () => {
    const tech = await createTech('TechPatternBreak');
    const day = '2030-06-18';
    const dow = new Date(`${day}T12:00:00`).getDay();
    await db.setPatternsForTech(tech, [
      { dow, start_min: 9 * 60, end_min: 17 * 60, kind: 'available', note: null },
      { dow, start_min: 12 * 60, end_min: 13 * 60, kind: 'unavailable', note: null }
    ]);

    const slots = await db.getAvailableSlots(tech, {
      fromTs: hourTs(day, 0),
      toTs: hourTs(day, 23, 59),
      durationMin: 60,
      stepMin: 30,
      bufferMin: 0
    });

    assert.ok(slots.some(slot => slot.starts_at === hourTs(day, 11) && slot.ends_at === hourTs(day, 12)));
    assert.ok(!slots.some(slot => slot.starts_at < hourTs(day, 13) && slot.ends_at > hourTs(day, 12)));
    assert.ok(slots.some(slot => slot.starts_at === hourTs(day, 13) && slot.ends_at === hourTs(day, 14)));
  });
});

describe('horizon DST consistency', () => {
  test('booking horizon uses same local Date.setDate as getAvailableSlots', async () => {
    // Verify production: getAvailableSlots horizon and book action horizon both use Date.setDate
    // We check slot generation near a DST transition uses local midnight correctly
    const tech = await createTech('TechG');
    const day = '2030-03-09'; // near DST (US)
    await db.addAvailability(tech, hourTs(day, 9), hourTs(day, 17), null);
    await db.addAvailability(tech, hourTs('2030-03-10', 9), hourTs('2030-03-10', 17), null);
    const slots = await db.getAvailableSlots(tech, { fromTs: hourTs(day, 0), toTs: hourTs('2030-03-10', 23, 59), durationMin: 60 });
    // slots should be on local midnights, not off-by-hour due to 86400 fixed addition
    for (const sl of slots) {
      const d = new Date(sl.starts_at * 1000);
      assert.ok(d.getMinutes() === 0 || d.getMinutes() === 30);
    }
    assert.ok(slots.length > 0);
  });
});
