import { describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let db;
let tmpDir;
let dbPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-atomic-'));
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

describe('atomic double-booking race', ()=>{
  test('concurrent createJob same slot exactly one succeeds', async ()=>{
    const tech = await db.createUser(`tech_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','tech','TechRace');
    const sales = await db.createUser(`sales_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','sales','SalesRace');
    const day='2030-07-01';
    await setHours(tech, hourTs(day,9), hourTs(day,17));
    const s=hourTs(day,10), e=hourTs(day,11);
    const p1 = db.createJob({ tech_id: tech, booked_by: sales, client_name:'A', address:'1 St', starts_at:s, ends_at:e });
    const p2 = db.createJob({ tech_id: tech, booked_by: sales, client_name:'B', address:'2 St', starts_at:s, ends_at:e });
    const [r1,r2]=await Promise.all([p1,p2]);
    const successes=[r1,r2].filter(r=>'id' in r);
    const conflicts=[r2,r1].filter(r=>'conflict' in r);
    assert.equal(successes.length, 1, `expected exactly one success got ${JSON.stringify([r1,r2])}`);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].conflict, 'tech_busy');
    // exactly one job persisted
    const { default: Database } = await import('better-sqlite3');
    const sqlite=new Database(dbPath);
    const rows=sqlite.prepare('SELECT COUNT(*) as c FROM jobs WHERE tech_id=? AND status != ?').get(tech,'cancelled');
    sqlite.close();
    assert.equal(rows.c, 1);
  });

  test('atomic scheduling update rejection leaves stored row unchanged', async ()=>{
    const tech = await db.createUser(`tech_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','tech','TechUpd');
    const sales = await db.createUser(`sales_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','sales','SalesUpd');
    const day='2030-07-02';
    await setHours(tech, hourTs(day,9), hourTs(day,17));
    const s1=hourTs(day,10), e1=hourTs(day,11);
    const s2=hourTs(day,11,30), e2=hourTs(day,12,30);
    const r1=await db.createJob({ tech_id: tech, booked_by: sales, client_name:'C', address:'1 St', starts_at:s1, ends_at:e1 });
    const r2=await db.createJob({ tech_id: tech, booked_by: sales, client_name:'D', address:'2 St', starts_at:s2, ends_at:e2 });
    assert.ok('id' in r1 && 'id' in r2);
    // try to move r2 to overlap r1
    const before = await db.getJobRaw(r2.id);
    const res = await db.updateJob(r2.id, { starts_at: s1+1800, ends_at: e1+1800 }, sales);
    assert.ok('conflict' in res);
    const after = await db.getJobRaw(r2.id);
    assert.equal(after.starts_at, before.starts_at);
    assert.equal(after.ends_at, before.ends_at);
    // no event logged for failed mutation - count events for r2 should be 1 (created)
    const { default: Database } = await import('better-sqlite3');
    const sqlite=new Database(dbPath);
    const evts=sqlite.prepare('SELECT COUNT(*) as c FROM job_events WHERE job_id=? AND kind=?').get(r2.id,'edited');
    sqlite.close();
    assert.equal(evts.c, 0);
  });

  test('atomic status transition rejection leaves row unchanged', async ()=>{
    const tech = await db.createUser(`tech_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','tech','TechStat');
    const sales = await db.createUser(`sales_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123','sales','SalesStat');
    const day='2030-07-03';
    await setHours(tech, hourTs(day,9), hourTs(day,17));
    const s=hourTs(day,10), e=hourTs(day,11);
    const r1=await db.createJob({ tech_id: tech, booked_by: sales, client_name:'E', address:'1 St', starts_at:s, ends_at:e });
    assert.ok('id' in r1);
    await db.setJobStatus(r1.id,'cancelled');
    // create overlapping job
    const r2=await db.createJob({ tech_id: tech, booked_by: sales, client_name:'F', address:'2 St', starts_at:s, ends_at:e });
    assert.ok('id' in r2);
    // try to reactivate r1 to sent - should fail
    const before = await db.getJobRaw(r1.id);
    const res = await db.setJobStatus(r1.id,'sent');
    assert.ok('conflict' in res);
    const after = await db.getJobRaw(r1.id);
    assert.equal(after.status, before.status);
    // no status event for failed transition
    const { default: Database } = await import('better-sqlite3');
    const sqlite=new Database(dbPath);
    const evts=sqlite.prepare('SELECT * FROM job_events WHERE job_id=? ORDER BY created_at DESC').all(r1.id);
    // last event should be cancelled, not a new sent attempt
    const hasSentAfterCancel = evts.some(ev=>ev.to_val==='sent' && ev.from_val==='cancelled');
    sqlite.close();
    assert.equal(hasSentAfterCancel, false);
  });
});
