import { describe, test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions as editActions } from '../src/routes/jobs/[id]/edit/+page.server.ts';

let db;
let tmpDir;
let dbPath;

// Stub the geocode provider: book/edit tests must be hermetic (no upstream HTTP).
const realFetch = globalThis.fetch;

beforeAll(async () => {
  globalThis.fetch = (async (url, init) => {
    if (String(url).includes('photon.komoot.io')) return new Response('{"features":[]}', { status: 200 });
    return realFetch(url, init);
  });
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-actions-edit-'));
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
  return db.createUser(`${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123', role, name);
}
function vparts(offsetDays) {
  const p = db.getVancouverParts(Math.floor(Date.now() / 1000) + offsetDays * 86400);
  const pad = (n) => String(n).padStart(2, '0');
  return { y: p.year, m: p.month, d: p.day, dow: p.dow, iso: `${p.year}-${pad(p.month)}-${pad(p.day)}` };
}
async function setup() {
  const tech = await mkUser('tech', 'EditAct Tech');
  const sales = await mkUser('sales', 'EditAct Sales');
  const sales2 = await mkUser('sales', 'EditAct Sales2');
  const { y, m, d, dow } = vparts(1);
  await db.setPatternsForTech(tech, [{ dow, start_min: 540, end_min: 1020 }]);
  const res = await db.createJob({
    tech_id: tech, booked_by: sales, client_name: 'Edit Client',
    address: '1 Main St, Vancouver, BC V6A 1A1',
    street: '1 Main St', city: 'Vancouver', province: 'BC', postal_code: 'V6A 1A1',
    starts_at: db.vancouverWallToEpoch(y, m, d, 10, 0),
    ends_at: db.vancouverWallToEpoch(y, m, d, 11, 0)
  });
  assert.ok(!('conflict' in res));
  return { tech, sales, sales2, jobId: res.id };
}
function saveFd(overrides = {}) {
  const { iso } = vparts(1);
  const base = {
    client_name: 'Edit Client', street: '1 Main St', city: 'Vancouver', province: 'BC',
    postal_code: 'V6A 1A1', email: '', phone: '', dob: '', telus_pin: '', id_type: '',
    id_last4: '', emergency_name: '', emergency_number: '', emergency_relation: '',
    verbal_password: '', security_offered: '', notes: '', price: '',
    date: iso, start: '10:00', duration: '60', tech_id: ''
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v);
  return fd;
}
const saveReq = (fd) => new Request('http://test/jobs/1/edit?/save', { method: 'POST', body: fd });
const delReq = () => new Request('http://test/jobs/1/edit?/delete', { method: 'POST', body: new FormData() });
const user = (id, role) => ({ id, role, username: `${role}${id}`, display_name: `${role}${id}` });

async function caughtRedirect(promise) {
  try {
    await promise;
  } catch (e) {
    return e;
  }
  assert.fail('expected redirect');
}

describe('edit save action', () => {
  test('permission matrix: anon, cross-tech and non-booker get 403', async () => {
    const { tech, sales2, jobId } = await setup();
    const tech2 = await mkUser('tech', 'EditAct Other');
    let r = await editActions.save({ request: saveReq(saveFd()), params: { id: String(jobId) }, locals: {} });
    assert.equal(r.status, 403);
    r = await editActions.save({ request: saveReq(saveFd()), params: { id: String(jobId) }, locals: { user: user(tech2, 'tech') } });
    assert.equal(r.status, 403);
    r = await editActions.save({ request: saveReq(saveFd()), params: { id: String(jobId) }, locals: { user: user(sales2, 'sales') } });
    assert.equal(r.status, 403);
    assert.equal((await db.getJob(jobId)).client_name, 'Edit Client');
  });

  test('validation: email, date, postal, tech', async () => {
    const { sales, tech, jobId } = await setup();
    const loc = { user: user(sales, 'sales') };
    let r = await editActions.save({ request: saveReq(saveFd({ tech_id: String(tech), email: 'nope' })), params: { id: String(jobId) }, locals: loc });
    assert.equal(r.status, 400);
    r = await editActions.save({ request: saveReq(saveFd({ tech_id: String(tech), date: '2026-13-99' })), params: { id: String(jobId) }, locals: loc });
    assert.equal(r.status, 400);
    r = await editActions.save({ request: saveReq(saveFd({ tech_id: String(tech), postal_code: 'xyz' })), params: { id: String(jobId) }, locals: loc });
    assert.equal(r.status, 400);
    r = await editActions.save({ request: saveReq(saveFd({ tech_id: '424242' })), params: { id: String(jobId) }, locals: loc });
    assert.equal(r.status, 400);
  });

  test('past schedule and completed-job moves are rejected', async () => {
    const { tech, sales, jobId } = await setup();
    const loc = { user: user(sales, 'sales') };
    const past = vparts(-1);
    let r = await editActions.save({
      request: saveReq(saveFd({ tech_id: String(tech), date: past.iso, start: '10:00' })),
      params: { id: String(jobId) }, locals: loc
    });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /future/);

    await db.setJobStatus(jobId, 'signed', sales);
    await db.setJobCompleted(jobId, Math.floor(Date.now() / 1000), sales);
    r = await editActions.save({
      request: saveReq(saveFd({ tech_id: String(tech), start: '11:00' })),
      params: { id: String(jobId) }, locals: loc
    });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /reopen/);
    // …but a notes-only edit on a completed job still works.
    r = await editActions.save({
      request: saveReq(saveFd({ tech_id: String(tech), notes: 'gate code 9' })),
      params: { id: String(jobId) }, locals: loc
    }).catch((e) => e);
    assert.ok(!(r && r.status && r.status !== 303), `unexpected failure: ${JSON.stringify(r)}`);
  });

  test('successful save redirects and notifies the tech', async () => {
    const { tech, sales, jobId } = await setup();
    const err = await caughtRedirect(editActions.save({
      request: saveReq(saveFd({ tech_id: String(tech), notes: 'ring twice', phone: '+16045550100' })),
      params: { id: String(jobId) }, locals: { user: user(sales, 'sales') }
    }));
    assert.equal(err.status, 303);
    assert.equal(err.location, `/jobs/${jobId}`);
    const job = await db.getJob(jobId);
    assert.equal(job.notes, 'ring twice');
    assert.equal(job.phone, '+16045550100');
    const rows = await db.listNotifications(tech, 10);
    assert.ok(rows.some((n) => n.url === `/jobs/${jobId}` && /details edited/.test(n.body)));
  });

  test('no-op save writes nothing and pings nobody', async () => {
    const { tech, sales, jobId } = await setup();
    const before = await db.getJob(jobId);
    const err = await caughtRedirect(editActions.save({
      request: saveReq(saveFd({ tech_id: String(tech) })),
      params: { id: String(jobId) }, locals: { user: user(sales, 'sales') }
    }));
    assert.equal(err.status, 303);
    const after = await db.getJob(jobId);
    assert.equal(after.updated_at, before.updated_at);
    assert.deepEqual(await db.listNotifications(tech, 10), []);
  });
});

describe('edit delete action', () => {
  test('only the booker can delete; completed jobs are protected', async () => {
    const { tech, sales, sales2, jobId } = await setup();
    let r = await editActions.delete({ params: { id: String(jobId) }, locals: { user: user(tech, 'tech') } });
    assert.equal(r.status, 403);
    r = await editActions.delete({ params: { id: String(jobId) }, locals: { user: user(sales2, 'sales') } });
    assert.equal(r.status, 403);
    assert.ok(await db.getJob(jobId));

    await db.setJobStatus(jobId, 'signed', sales);
    await db.setJobCompleted(jobId, Math.floor(Date.now() / 1000), sales);
    r = await editActions.delete({ params: { id: String(jobId) }, locals: { user: user(sales, 'sales') } });
    assert.equal(r.status, 400);
    assert.ok(await db.getJob(jobId));
  });

  test('booker delete removes the job, redirects home, notifies the tech', async () => {
    const { tech, sales, jobId } = await setup();
    const err = await caughtRedirect(editActions.delete({ params: { id: String(jobId) }, locals: { user: user(sales, 'sales') } }));
    assert.equal(err.status, 303);
    assert.equal(err.location, '/');
    assert.equal(await db.getJob(jobId), undefined);
    const rows = await db.listNotifications(tech, 10);
    assert.ok(rows.some((n) => n.url === '/' && /deleted/.test(n.body)));
  });
});
