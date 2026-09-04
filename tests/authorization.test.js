import { describe, test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRedirect, isDeprecated, isAdminBlocked } from '../src/lib/server/routePolicy';

describe('deprecation redirect logic', () => {
  test('income/stats deprecated', () => {
    assert.equal(isDeprecated('/income'), true);
    assert.equal(isDeprecated('/income/foo'), true);
    assert.equal(isDeprecated('/stats'), true);
    assert.equal(isDeprecated('/stats/foo'), true);
    assert.equal(isDeprecated('/clients'), false);
    assert.equal(isDeprecated('/'), false);
  });
  test('unauthenticated deprecated -> /login', () => {
    assert.equal(getRedirect('/income', null), '/login');
    assert.equal(getRedirect('/stats', null), '/login');
  });
  test('sales/tech deprecated -> /', () => {
    assert.equal(getRedirect('/income', { role: 'sales' }), '/');
    assert.equal(getRedirect('/stats', { role: 'tech' }), '/');
  });
  test('admin deprecated -> /clients', () => {
    assert.equal(getRedirect('/income', { role: 'admin' }), '/clients');
    assert.equal(getRedirect('/stats', { role: 'admin' }), '/clients');
  });
});

describe('admin route policy', () => {
  test('admin allowed only admin/clients', () => {
    assert.equal(getRedirect('/admin', { role: 'admin' }), null);
    assert.equal(getRedirect('/admin/foo', { role: 'admin' }), null);
    assert.equal(getRedirect('/clients', { role: 'admin' }), null);
    assert.equal(getRedirect('/clients/foo', { role: 'admin' }), null);
  });
  test('admin export allowed', () => {
    assert.equal(getRedirect('/export', { role: 'admin' }), null);
    assert.equal(getRedirect('/export?from=2024-01-01', { role: 'admin' }), null);
    assert.equal(isAdminBlocked('/export'), false);
  });
  test('admin blocked product pages -> /clients', () => {
    for (const p of ['/', '/calendar', '/calendar?w=1', '/book', '/availability', '/map', '/route', '/jobs/123', '/income', '/stats']) {
      assert.equal(getRedirect(p, { role: 'admin' }), '/clients', `expected ${p} to redirect`);
      assert.equal(isAdminBlocked(p), true, `${p} should be admin blocked`);
    }
  });
  test('sales/tech export redirect -> /', () => {
    assert.equal(getRedirect('/export', { role: 'sales' }), '/');
    assert.equal(getRedirect('/export', { role: 'tech' }), '/');
    assert.equal(getRedirect('/export?from=2024-01-01', { role: 'sales' }), '/');
  });
  test('dashboard view model - tech personal queue via production helper', async () => {
    const { getTodayHeading, shouldShowTechCards, shouldShowTechsBusy, shouldShowExportLink } = await import('../src/lib/dashboardView');
    assert.equal(getTodayHeading(true, 3), 'Your jobs · 3');
    assert.equal(getTodayHeading(false, 5), 'Today · 5 total');
    assert.equal(shouldShowTechCards(true), false);
    assert.equal(shouldShowTechCards(false), true);
    assert.equal(shouldShowTechsBusy(true), false);
    assert.equal(shouldShowTechsBusy(false), true);
    assert.equal(shouldShowExportLink('admin'), true);
    assert.equal(shouldShowExportLink('sales'), false);
    assert.equal(shouldShowExportLink('tech'), false);
  });
  test('sales/tech not blocked by admin policy', () => {
    assert.equal(getRedirect('/', { role: 'sales' }), null);
    assert.equal(getRedirect('/calendar', { role: 'tech' }), null);
    assert.equal(getRedirect('/map', { role: 'tech' }), null);
  });
  test('admin api redirect -> /clients', () => {
    assert.equal(getRedirect('/api/geocode', { role: 'admin' }), '/clients');
    assert.equal(getRedirect('/api/other', { role: 'admin' }), '/clients');
  });
  test('admin unknown path redirect -> /clients', () => {
    assert.equal(getRedirect('/unknown', { role: 'admin' }), '/clients');
    assert.equal(getRedirect('/foo/bar', { role: 'admin' }), '/clients');
  });
  test('authenticated admin /login redirect -> /clients', () => {
    assert.equal(getRedirect('/login', { role: 'admin' }), '/clients');
  });
  test('technician api geocode redirect -> /', () => {
    assert.equal(getRedirect('/api/geocode', { role: 'tech' }), '/');
    assert.equal(getRedirect('/api/geocode/foo', { role: 'tech' }), '/');
  });
  test('sales api geocode allowed', () => {
    assert.equal(getRedirect('/api/geocode', { role: 'sales' }), null);
  });
  test('unauthenticated framework/static not redirected to login', () => {
    assert.equal(getRedirect('/_app/immutable/foo.js', null), null);
    assert.equal(getRedirect('/.well-known/foo', null), null);
    assert.equal(getRedirect('/favicon.ico', null), null);
    assert.equal(getRedirect('/robots.txt', null), null);
    assert.equal(getRedirect('/manifest.webmanifest', null), null);
    assert.equal(getRedirect('/sw.js', null), null);
  });
  test('robots.txt public for all roles', () => {
    assert.equal(getRedirect('/robots.txt', null), null);
    assert.equal(getRedirect('/robots.txt', { role: 'sales' }), null);
    assert.equal(getRedirect('/robots.txt', { role: 'tech' }), null);
    assert.equal(getRedirect('/robots.txt', { role: 'admin' }), null);
  });
  test('unauthenticated api redirects to login', () => {
    assert.equal(getRedirect('/api/geocode', null), '/login');
  });
});

describe('job route authorization - cross-tech forbidden (real helper)', () => {
  test('tech cannot load or act on another tech job - real helper throws 403', async () => {
    const { isTechForbidden, assertJobLoadAccess } = await import('../src/lib/server/jobAccess');
    const techA = { id: 101, role: 'tech' };
    const techBJob = { tech_id: 202 };
    const ownJob = { tech_id: 101 };
    assert.equal(isTechForbidden(techA, techBJob), true);
    assert.equal(isTechForbidden(techA, ownJob), false);
    assert.equal(isTechForbidden({ id: 55, role: 'sales' }, techBJob), false);
    let threw = false;
    try { assertJobLoadAccess(techA, techBJob); } catch (e) { threw = true; assert.equal(e.status, 403); }
    assert.equal(threw, true);
    // own job should not throw
    assert.doesNotThrow(() => assertJobLoadAccess(techA, ownJob));
  });
});


async function setHours(techId, startTs, endTs) {
  const dbmod = await import('../src/lib/server/db');
  const start = dbmod.getVancouverParts(startTs);
  const end = dbmod.getVancouverParts(endTs);
  const dow = start.dow;
  const sMin = start.hour * 60 + start.minute;
  let eMin = end.hour * 60 + end.minute;
  if (eMin === 0 && endTs > startTs) eMin = 1440;
  const existing = await dbmod.listTemplates(techId);
  const byDow = new Map();
  for (const r of existing) byDow.set(r.dow, { start_min: r.start_min, end_min: r.end_min });
  const cur = byDow.get(dow);
  if (cur) { cur.start_min = Math.min(cur.start_min, sMin); cur.end_min = Math.max(cur.end_min, eMin); }
  else byDow.set(dow, { start_min: sMin, end_min: eMin });
  await dbmod.setPatternsForTech(techId, Array.from(byDow.entries()).map(([d,v])=>({dow: d, start_min: v.start_min, end_min: v.end_min})));
}

describe('technician scoping (db)', () => {
  let db, tmpDir, dbPath;
  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'brinks-auth-'));
    dbPath = join(tmpDir, 'test.db');
    db = await import('../src/lib/server/db');
    db.__setTestDbPath(dbPath);
  });
  afterAll(() => {
    try { db.__setTestDbPath(null); } catch {}
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('route tech-id forcing - only own jobs returned', async () => {
    await db.listUsers();
    const { default: Database } = await import('better-sqlite3');
    let sqlite = new Database(dbPath);
    sqlite.exec("DELETE FROM jobs; DELETE FROM users WHERE username LIKE 'tech%';");
    sqlite.close();
    const techA = await db.createUser(`techA_${Date.now()}`, 'pass123', 'tech', 'Tech A');
    const techB = await db.createUser(`techB_${Date.now()}`, 'pass123', 'tech', 'Tech B');
    const sales = await db.createUser(`sales_${Date.now()}`, 'pass123', 'sales', 'Sales');
    const day = '2030-07-01';
    const s = (h,m=0)=>{ const [y,mo,da]=day.split('-').map(Number); let guess=Date.UTC(y,mo-1,da,h,m,0)/1000; for(let i=0;i<3;i++){ const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/Vancouver',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hour12:false}); const parts=fmt.formatToParts(new Date(guess*1000)); const mp=new Map(parts.map(p=>[p.type,p.value])); const py=Number(mp.get('year')), pm=Number(mp.get('month')), pd=Number(mp.get('day')), ph=Number(mp.get('hour')), pmi=Number(mp.get('minute')), ps=Number(mp.get('second')); const guessWall=Date.UTC(py,pm-1,pd,ph,pmi,ps)/1000; const desiredWall=Date.UTC(y,mo-1,da,h,m,0)/1000; const delta=desiredWall-guessWall; if(delta===0) break; guess+=delta; } return Math.floor(guess); };
    await setHours(techA, s(9), s(17));
    await setHours(techB, s(9), s(17));
    const rA = await db.createJob({ tech_id: techA, booked_by: sales, client_name: 'A Client', address: '1 St', starts_at: s(10), ends_at: s(11) });
    const rB = await db.createJob({ tech_id: techB, booked_by: sales, client_name: 'B Client', address: '2 St', starts_at: s(12), ends_at: s(13) });
    assert.ok('id' in rA && 'id' in rB);
    // simulate route load: techA forces techId = techA, should only get own job
    const s0 = s(0); const dayStart = s0; const dayEnd = (()=>{ const y=2030,mo=7,da=2; let guess=Date.UTC(y,mo-1,da,0,0,0)/1000; for(let i=0;i<3;i++){ const fmt=new Intl.DateTimeFormat('en-US',{timeZone:'America/Vancouver',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',hour12:false}); const parts=fmt.formatToParts(new Date(guess*1000)); const mp=new Map(parts.map(p=>[p.type,p.value])); const py=Number(mp.get('year')), pm=Number(mp.get('month')), pd=Number(mp.get('day')), ph=Number(mp.get('hour')), pmi=Number(mp.get('minute')), ps=Number(mp.get('second')); const guessWall=Date.UTC(py,pm-1,pd,ph,pmi,ps)/1000; const desiredWall=Date.UTC(y,mo-1,da,0,0,0)/1000; const delta=desiredWall-guessWall; if(delta===0) break; guess+=delta; } return Math.floor(guess); })();
    const jobsForA = await db.listJobs(dayStart, dayEnd, techA);
    assert.equal(jobsForA.length, 1);
    assert.equal(jobsForA[0].tech_id, techA);
    // cross-tech job denial
    const jobB = await db.getJob(rB.id);
    assert.ok(jobB);
    const forbidden = jobB.tech_id !== techA;
    assert.equal(forbidden, true);
    // map scoping
    sqlite = new Database(dbPath);
    sqlite.prepare('UPDATE jobs SET lat=?, lng=? WHERE id=?').run(49.28, -123.12, rA.id);
    sqlite.prepare('UPDATE jobs SET lat=?, lng=? WHERE id=?').run(49.28, -123.13, rB.id);
    sqlite.close();
    const mapA = await db.listJobsForMapForTech(techA);
    assert.equal(mapA.length, 1);
    assert.equal(mapA[0].tech_id, techA);
    const mapAll = await db.listAllJobsForMap();
    assert.ok(mapAll.length >= 2);
    // dashboard scoping: tech only sees own
    const dashA = await db.listJobs(dayStart, dayEnd, techA);
    assert.ok(dashA.every(j => j.tech_id === techA));
  });
});

describe('local wall dates', () => {
  test('localIsoDay never shifts like toISOString (Vancouver evening)', async () => {
    // Pin TZ: the point is Vancouver wall behavior regardless of runner zone.
    const prevTz = process.env.TZ;
    process.env.TZ = 'America/Vancouver';
    try {
      const { localIsoDay, localIsoTomorrow } = await import('../src/lib/dashboardView');
      // 9pm PDT Oct 14 = Oct 15 04:00 UTC — toISOString says the 15th.
      const evening = new Date(2026, 9, 14, 21, 30, 0);
      assert.equal(evening.toISOString().slice(0, 10), '2026-10-15');
      assert.equal(localIsoDay(evening), '2026-10-14');
      assert.equal(localIsoTomorrow(evening), '2026-10-15');
      assert.match(localIsoDay(), /^\d{4}-\d{2}-\d{2}$/);
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });
});
