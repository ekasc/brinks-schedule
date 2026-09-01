import { describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let db;
let tmpDir;
let dbPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-pii-'));
  dbPath = join(tmpDir, 'test.db');
  db = await import('../src/lib/server/db');
  db.__setTestDbPath(dbPath);
});

afterAll(() => {
  try { db.__setTestDbPath(null); } catch {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

function hourTs(dateStr, hour, min=0){
  return Math.floor(new Date(`${dateStr}T${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`).getTime()/1000);
}

beforeEach(async () => {
  await db.listUsers();
  const { default: Database } = await import('better-sqlite3');
  const sqlite = new Database(dbPath);
  sqlite.exec('DELETE FROM jobs; DELETE FROM job_events; DELETE FROM availability_templates;');
  sqlite.close();
});

describe('PII safe boundary', () => {
  test('summary does not contain private keys at all (not null)', async () => {
    const tech = await db.createUser(`tech_${Date.now()}_${Math.random()}`, 'pass123', 'tech', 'TechPII');
    const sales = await db.createUser(`sales_${Date.now()}_${Math.random()}`, 'pass123', 'sales', 'SalesPII');
    const day='2030-08-10';
    const dow = new Date(`${day}T12:00:00`).getDay();
    await db.setPatternsForTech(tech, [{ dow, start_min: 9*60, end_min: 17*60 }]);
    const r = await db.createJob({
      tech_id: tech, booked_by: sales, client_name: 'Private Client', address: '123 Main St',
      starts_at: hourTs(day,10), ends_at: hourTs(day,11),
      phone: '604-555-1234', dob: '1990-01-01', telus_pin: '1234', id_type: 'dl', id_last4: '5678',
      emergency_name: 'EC', emergency_number: '604-555-9999', emergency_relation: 'friend', verbal_password: 'apple'
    });
    assert.ok('id' in r);
    const summary = await db.getJobSummary(r.id);
    // Private keys must be absent, not just null
    for (const k of ['phone','id_type','dob','telus_pin','id_last4','emergency_name','emergency_number','emergency_relation','verbal_password']){
      assert.equal(k in summary, false, `${k} should be absent from summary`);
    }
    // Public keys must exist
    assert.ok('client_name' in summary);
    assert.ok('address' in summary);
    assert.ok('tech_name' in summary);
    // Private fetch should contain them (when authorized)
    const priv = await db.getJobPrivate(r.id);
    assert.equal(priv.phone, '604-555-1234');
    assert.equal(priv.dob, '1990-01-01');
    assert.equal(priv.id_type, 'dl');
  });

  test('listJobsSummary never leaks PII', async () => {
    const tech = await db.createUser(`tech2_${Date.now()}_${Math.random()}`, 'pass123', 'tech', 'TechPII2');
    const sales = await db.createUser(`sales2_${Date.now()}_${Math.random()}`, 'pass123', 'sales', 'SalesPII2');
    const day='2030-08-11';
    const dow2 = new Date(`${day}T12:00:00`).getDay();
    await db.setPatternsForTech(tech, [{ dow: dow2, start_min: 9*60, end_min: 17*60 }]);
    await db.createJob({ tech_id: tech, booked_by: sales, client_name:'C1', address:'a', starts_at: hourTs(day,10), ends_at: hourTs(day,11), phone:'604-111-2222', dob:'1991-02-02' });
    const rows = await db.listJobsSummary(hourTs(day,9), hourTs(day,17), tech);
    for (const row of rows){
      for (const k of ['phone','id_type','dob','telus_pin','id_last4','emergency_name','emergency_number','emergency_relation','verbal_password']){
        assert.equal(k in row, false, `${k} should be absent from listJobsSummary`);
      }
    }
  });
});
