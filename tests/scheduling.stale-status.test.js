import { describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let db;
let tmpDir;
let dbPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-stale-'));
  dbPath = join(tmpDir, 'test.db');
  db = await import('$lib/server/db');
  db.__setTestDbPath(dbPath);
});

afterAll(() => {
  try { db.__setTestDbPath(null); } catch {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});


async function setHours(techId, startTs, endTs) {
  const start = db.getVancouverParts(startTs);
  const end = db.getVancouverParts(endTs);
  const dow = start.dow;
  const sMin = start.hour * 60 + start.minute;
  let eMin = end.hour * 60 + end.minute;
  if (eMin === 0 && endTs > startTs) eMin = 1440;
  // merge with existing patterns to preserve other weekdays
  const existing = await db.listTemplates(techId);
  const byDow = new Map();
  for (const r of existing) byDow.set(r.dow, { start_min: r.start_min, end_min: r.end_min });
  const cur = byDow.get(dow);
  if (cur) { cur.start_min = Math.min(cur.start_min, sMin); cur.end_min = Math.max(cur.end_min, eMin); }
  else byDow.set(dow, { start_min: sMin, end_min: eMin });
  await db.setPatternsForTech(techId, Array.from(byDow.entries()).map(([d,v])=>({dow: d, start_min: v.start_min, end_min: v.end_min})));
}

function hourTs(dateStr, hour, min=0){
  const [y,m,d]=dateStr.split('-').map(Number);
  let guess = Date.UTC(y,m-1,d,hour,min,0)/1000;
  for(let i=0;i<3;i++){
    const fmt = new Intl.DateTimeFormat('en-US',{timeZone:'America/Vancouver',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hour12:false});
    const parts = fmt.formatToParts(new Date(guess*1000));
    const mp=new Map(parts.map(p=>[p.type,p.value]));
    const py=Number(mp.get('year')), pm=Number(mp.get('month')), pd=Number(mp.get('day')), ph=Number(mp.get('hour')), pmi=Number(mp.get('minute')), ps=Number(mp.get('second'));
    const guessWall=Date.UTC(py,pm-1,pd,ph,pmi,ps)/1000;
    const desiredWall=Date.UTC(y,m-1,d,hour,min,0)/1000;
    const delta=desiredWall-guessWall;
    if(delta===0) break;
    guess+=delta;
  }
  return Math.floor(guess);
}

beforeEach(async ()=>{
  await db.listUsers();
  const { default: Database } = await import('better-sqlite3');
  const sqlite = new Database(dbPath);
  sqlite.exec('DELETE FROM jobs; DELETE FROM job_events; DELETE FROM availability_templates; DELETE FROM pii_access_log;');
  sqlite.close();
});

describe('stale status transition regression', ()=>{
  test('cancelled row mutated to overlap live blocker cannot transition via setJobStatus (live-row validation)', async ()=>{
    const tech = await db.createUser(`tech_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','tech','TechStale');
    const sales = await db.createUser(`sales_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','sales','SalesStale');
    const day='2030-08-10';
    await setHours(tech, hourTs(day,9), hourTs(day,17));
    const s1=hourTs(day,10), e1=hourTs(day,11);
    const s2=hourTs(day,12), e2=hourTs(day,13);
    const blocker = await db.createJob({ tech_id: tech, booked_by: sales, client_name:'Blocker', address:'1 St', starts_at:s1, ends_at:e1 });
    assert.ok('id' in blocker);
    const cancelled = await db.createJob({ tech_id: tech, booked_by: sales, client_name:'Cancelled', address:'2 St', starts_at:s2, ends_at:e2 });
    assert.ok('id' in cancelled);
    await db.setJobStatus(cancelled.id, 'cancelled');
    // Directly mutate cancelled row to overlap blocker — simulates stale read where job was moved after status was read.
    const { default: Database } = await import('better-sqlite3');
    const sqlite = new Database(dbPath);
    sqlite.prepare('UPDATE jobs SET starts_at=?, ends_at=? WHERE id=?').run(s1+1800, e1+1800, cancelled.id);
    sqlite.close();
    const res = await db.setJobStatus(cancelled.id, 'sent');
    assert.ok('conflict' in res, `expected conflict but got ${JSON.stringify(res)}`);
    const after = await db.getJobRaw(cancelled.id);
    assert.equal(after.status, 'cancelled');
    // no event logged for failed transition
    const sqlite2 = new Database(dbPath);
    const evts = sqlite2.prepare("SELECT * FROM job_events WHERE job_id=? AND to_val IN ('sent','signed')").all(cancelled.id);
    sqlite2.close();
    assert.equal(evts.length, 0);
    // signed path also rejected from same live overlapping state
    const res2 = await db.setJobStatus(cancelled.id, 'signed');
    assert.ok('conflict' in res2);
    const after2 = await db.getJobRaw(cancelled.id);
    assert.equal(after2.status, 'cancelled');
    const sqlite3 = new Database(dbPath);
    const evts2 = sqlite3.prepare("SELECT * FROM job_events WHERE job_id=? AND to_val IN ('sent','signed')").all(cancelled.id);
    sqlite3.close();
    assert.equal(evts2.length, 0);
  });

  test('conditional helper validates live row overlap (authoritative SQL, no stale params)', async ()=>{
    const tech = await db.createUser(`tech_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','tech','TechHelper');
    const sales = await db.createUser(`sales_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','sales','SalesHelper');
    const day='2030-08-12';
    await setHours(tech, hourTs(day,9), hourTs(day,17));
    const s1=hourTs(day,10), e1=hourTs(day,11);
    const s2=hourTs(day,12), e2=hourTs(day,13);
    const blocker = await db.createJob({ tech_id: tech, booked_by: sales, client_name:'Blk', address:'1 St', starts_at:s1, ends_at:e1 });
    assert.ok('id' in blocker);
    const victim = await db.createJob({ tech_id: tech, booked_by: sales, client_name:'Vic', address:'2 St', starts_at:s2, ends_at:e2 });
    assert.ok('id' in victim);
    await db.setJobStatus(victim.id, 'cancelled');
    const { default: Database } = await import('better-sqlite3');
    const sqlite = new Database(dbPath);
    sqlite.prepare('UPDATE jobs SET starts_at=?, ends_at=? WHERE id=?').run(s1+900, e1+900, victim.id);
    sqlite.close();
    // Exercise the same conditional helper production uses
    const changes = await db.__setJobStatusConditional(victim.id, 'sent', 'cancelled');
    assert.equal(changes, 0);
    const cur = await db.getJobRaw(victim.id);
    assert.equal(cur.status, 'cancelled');
    // alternate alias also same function
    const changes2 = await db.__testOnly_setJobStatusConditional(victim.id, 'signed', 'cancelled');
    assert.equal(changes2, 0);
  });

  test('optimistic predicate rejects mismatched expected status via helper (no hook)', async ()=>{
    const tech = await db.createUser(`tech_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','tech','TechOpt');
    const sales = await db.createUser(`sales_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','sales','SalesOpt');
    const day='2030-08-11';
    await setHours(tech, hourTs(day,9), hourTs(day,17));
    const s=hourTs(day,10), e=hourTs(day,11);
    const c = await db.createJob({ tech_id: tech, booked_by: sales, client_name:'Opt', address:'1 St', starts_at:s, ends_at:e });
    assert.ok('id' in c);
    await db.setJobStatus(c.id, 'cancelled');
    // helper with wrong expected status must affect 0 rows — predicate is authoritative
    const wrong = await db.__setJobStatusConditional(c.id, 'sent', 'sent');
    assert.equal(wrong, 0);
    const cur = await db.getJobRaw(c.id);
    assert.equal(cur.status, 'cancelled');
    // now change status to signed directly, then helper expecting cancelled must still fail
    const { default: Database } = await import('better-sqlite3');
    const sqlite = new Database(dbPath);
    sqlite.prepare("UPDATE jobs SET status='signed', updated_at=unixepoch() WHERE id=?").run(c.id);
    sqlite.close();
    const wrong2 = await db.__setJobStatusConditional(c.id, 'sent', 'cancelled');
    assert.equal(wrong2, 0);
    const cur2 = await db.getJobRaw(c.id);
    assert.equal(cur2.status, 'signed');
  });
});
