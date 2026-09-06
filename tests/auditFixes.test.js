import { describe, test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET as exportGET } from '../src/routes/export/+server';
import { load as todayLoad } from '../src/routes/+page.server';

let db;
let tmpDir;
let dbPath;

const realFetch = globalThis.fetch;

beforeAll(async () => {
  globalThis.fetch = (async (url, init) => {
    if (String(url).includes('photon.komoot.io'))
      return new Response('{"features":[{"geometry":{"coordinates":[-123.1,49.2]}}]}', { status: 200 });
    return realFetch(url, init);
  });
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-audit3-'));
  dbPath = join(tmpDir, 'test.db');
  db = await import('$lib/server/db');
  db.__setTestDbPath(dbPath);
  await db.listUsers();
});

afterAll(() => {
  globalThis.fetch = realFetch;
  try { db.__setTestDbPath(null); } catch {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  assert.ok(!dbPath.includes('data/schedule.db'));
});

async function mkUser(role, name) {
  const uname = `${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return db.createUser(uname, 'pass123', role, name);
}

describe('getVancouverParts midnight', () => {
  test('Vancouver midnight never reports hour 24', async () => {
    // 2026-09-05 00:00:00 America/Vancouver == 07:00 UTC (PDT).
    const ts = Date.UTC(2026, 8, 5, 7, 0, 0) / 1000;
    const p = db.getVancouverParts(ts);
    assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute, p.second], [2026, 9, 5, 0, 0, 0]);
  });
});

describe('export window is Vancouver-wall', () => {
  test('boundary jobs bucket by wall day, not server-local midnight', async () => {
    const tech = await mkUser('tech', 'Exp Tech');
    const sales = await mkUser('sales', 'Exp Sales');
    const admin = await mkUser('admin', 'Exp Admin');
    const dowOf = (y, m, d) => db.getVancouverParts(db.vancouverWallToEpoch(y, m, d, 12, 0)).dow;
    await db.setPatternsForTech(tech, [{ dow: dowOf(2026, 9, 4), start_min: 0, end_min: 1440 }, { dow: dowOf(2026, 9, 5), start_min: 0, end_min: 1440 }]);
    const mk = async (nm, y, m, d, h) => {
      const r = await db.createJob({
        tech_id: tech, booked_by: sales, client_name: nm,
        address: '1 Main St, Vancouver, BC V6A 1A1',
        street: '1 Main St', city: 'Vancouver', province: 'BC', postal_code: 'V6A 1A1',
        starts_at: db.vancouverWallToEpoch(y, m, d, h, 0), ends_at: db.vancouverWallToEpoch(y, m, d, h + 1, 0)
      });
      assert.ok(!('conflict' in r), JSON.stringify(r));
      return r.id;
    };
    // Sep 4 18:00 wall == Sep 5 01:00 UTC: must NOT appear in a Sep-5-only export.
    await mk(`Exp_Evening_${Date.now()}`, 2026, 9, 4, 18);
    // Sep 5 00:30 wall: must appear.
    const dayName = `Exp_Midnight_${Date.now()}`;
    await mk(dayName, 2026, 9, 5, 0);
    const res = await exportGET({
      url: new URL('http://test/export?from=2026-09-05&to=2026-09-05'),
      locals: { user: { id: admin, role: 'admin' } }
    });
    const csv = await res.text();
    assert.ok(csv.includes(dayName), 'midnight-wall job included');
    assert.ok(!csv.includes('Exp_Evening_'), 'previous-wall-evening job excluded');
    assert.ok(!csv.includes('enc:'), 'no ciphertext in CSV');
  });
});

describe('geocode backfill scoping', () => {
  test('tech-scoped backfill leaves other techs untouched', async () => {
    const t1 = await mkUser('tech', 'Geo T1');
    const t2 = await mkUser('tech', 'Geo T2');
    const sales = await mkUser('sales', 'Geo Sales');
    const p = db.getVancouverParts(Math.floor(Date.now() / 1000) + 86400);
    for (const t of [t1, t2]) await db.setPatternsForTech(t, [{ dow: p.dow, start_min: 540, end_min: 1020 }]);
    const mk = async (tech) => {
      const r = await db.createJob({
        tech_id: tech, booked_by: sales, client_name: `Geo ${tech} ${Date.now()}`,
        address: '99 No Coord St, Vancouver, BC V6A 1A1',
        street: '99 No Coord St', city: 'Vancouver', province: 'BC', postal_code: 'V6A 1A1',
        starts_at: db.vancouverWallToEpoch(p.year, p.month, p.day, 10, 0),
        ends_at: db.vancouverWallToEpoch(p.year, p.month, p.day, 11, 0)
      });
      assert.ok(!('conflict' in r));
      return r.id;
    };
    const j1 = await mk(t1);
    const j2 = await mk(t2);
    const res = await db.geocodeMissingCoords(100, t1);
    assert.equal(res.done, 1);
    const [r1, r2] = await Promise.all([db.getJob(j1), db.getJob(j2)]);
    assert.ok(r1.lat != null && r1.lng != null, 'own job geocoded');
    assert.ok(r2.lat == null && r2.lng == null, 'other tech job untouched');
  });
});

describe('contracts roster columns', () => {
  test('listContracts selects no PII columns', async () => {
    const tech = await mkUser('tech', 'Con Tech');
    const sales = await mkUser('sales', 'Con Sales');
    const p = db.getVancouverParts(Math.floor(Date.now() / 1000) + 86400);
    await db.setPatternsForTech(tech, [{ dow: p.dow, start_min: 540, end_min: 1020 }]);
    const r = await db.createJob({
      tech_id: tech, booked_by: sales, client_name: `Con ${Date.now()}`,
      address: '1 Main St, Vancouver, BC V6A 1A1',
      street: '1 Main St', city: 'Vancouver', province: 'BC', postal_code: 'V6A 1A1',
      starts_at: db.vancouverWallToEpoch(p.year, p.month, p.day, 10, 0),
      ends_at: db.vancouverWallToEpoch(p.year, p.month, p.day, 11, 0),
      dob: '1990-01-01', telus_pin: '1234', id_last4: '9999'
    });
    assert.ok(!('conflict' in r));
    const rows = await db.listContracts();
    assert.ok(rows.length > 0);
    for (const row of rows) {
      for (const k of ['dob', 'telus_pin', 'id_last4', 'emergency_name', 'emergency_number', 'verbal_password', 'password_hash']) {
        assert.ok(!(k in row), `contracts must not select ${k}`);
      }
    }
  });
});

describe('today roster keeps inactive techs', () => {
  test("disabling an account hides nothing: tech card and signed job stay visible", async () => {
    const active = await mkUser('tech', 'Today Active');
    const gone = await mkUser('tech', 'Today Gone');
    const sales = await mkUser('sales', 'Today Sales');
    const p = db.getVancouverParts(Math.floor(Date.now() / 1000));
    await db.setPatternsForTech(gone, [{ dow: p.dow, start_min: 0, end_min: 1440 }]);
    const r = await db.createJob({
      tech_id: gone, booked_by: sales, client_name: `Gone Job ${Date.now()}`,
      address: '1 Main St, Vancouver, BC V6A 1A1',
      street: '1 Main St', city: 'Vancouver', province: 'BC', postal_code: 'V6A 1A1',
      starts_at: db.vancouverWallToEpoch(p.year, p.month, p.day, p.hour, p.minute),
      ends_at: db.vancouverWallToEpoch(p.year, p.month, p.day, p.hour, p.minute) + 3600
    });
    assert.ok(!('conflict' in r));
    await db.setJobStatus(r.id, 'signed', sales);
    await db.setUserActive(gone, false);
    const data = await todayLoad({
      locals: { user: { id: sales, role: 'sales', username: 's', display_name: 'S' } },
      url: new URL('http://test/')
    });
    assert.ok(data.techs.some((t) => t.id === gone), 'inactive tech still listed');
    assert.ok(data.techs.some((t) => t.id === active), 'active tech kept');
    assert.ok(data.upcoming.some((j) => j.tech_id === gone), 'inactive tech job still visible');
  });
});
