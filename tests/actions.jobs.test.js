import { describe, test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions } from '../src/routes/jobs/[id]/+page.server.ts';

let db;
let tmpDir;
let dbPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-actions-jobs-'));
  dbPath = join(tmpDir, 'test.db');
  db = await import('$lib/server/db');
  db.__setTestDbPath(dbPath);
  await db.listUsers();
});

afterAll(() => {
  try { db.__setTestDbPath(null); } catch {}
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  assert.ok(!dbPath.includes('data/schedule.db'));
});

async function mkUser(role, name) {
  return db.createUser(`${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`, 'pass123', role, name);
}
function vparts(offsetDays) {
  const p = db.getVancouverParts(Math.floor(Date.now() / 1000) + offsetDays * 86400);
  return { y: p.year, m: p.month, d: p.day, dow: p.dow };
}
async function setup() {
  const tech = await mkUser('tech', 'JobAct Tech');
  const tech2 = await mkUser('tech', 'JobAct Tech2');
  const sales = await mkUser('sales', 'JobAct Sales');
  const sales2 = await mkUser('sales', 'JobAct Sales2');
  const { y, m, d, dow } = vparts(1);
  await db.setPatternsForTech(tech, [{ dow, start_min: 540, end_min: 1020 }]);
  const starts_at = db.vancouverWallToEpoch(y, m, d, 10, 0);
  const ends_at = db.vancouverWallToEpoch(y, m, d, 11, 0);
  const res = await db.createJob({
    tech_id: tech, booked_by: sales, client_name: 'Action Client',
    address: '1 Main St, Vancouver, BC V6A 1A1', starts_at, ends_at
  });
  assert.ok(!('conflict' in res));
  return { tech, tech2, sales, sales2, jobId: res.id };
}
function statusFd(status) {
  const fd = new FormData();
  fd.set('status', status);
  return fd;
}
function req(fd) {
  return new Request('http://test/jobs/1?/status', { method: 'POST', body: fd });
}
const user = (id, role) => ({ id, role, username: `${role}${id}`, display_name: `${role}${id}` });

describe('jobs status action', () => {
  test('unauthenticated, cross-tech and non-booker sales get 403', async () => {
    const { tech, tech2, sales2, jobId } = await setup();
    let r = await actions.status({ request: req(statusFd('signed')), params: { id: String(jobId) }, locals: {} });
    assert.equal(r.status, 403);
    r = await actions.status({ request: req(statusFd('signed')), params: { id: String(jobId) }, locals: { user: user(tech2, 'tech') } });
    assert.equal(r.status, 403);
    r = await actions.status({ request: req(statusFd('signed')), params: { id: String(jobId) }, locals: { user: user(sales2, 'sales') } });
    assert.equal(r.status, 403);
    assert.equal((await db.getJob(jobId)).status, 'sent');
  });

  test('invalid status is 400, missing job is 404', async () => {
    const { tech, jobId } = await setup();
    let r = await actions.status({ request: req(statusFd('bogus')), params: { id: String(jobId) }, locals: { user: user(tech, 'tech') } });
    assert.equal(r.status, 400);
    r = await actions.status({ request: req(statusFd('signed')), params: { id: '987654321' }, locals: { user: user(tech, 'tech') } });
    assert.equal(r.status, 404);
  });

  test('tech signs own job, other party is notified', async () => {
    const { tech, sales, jobId } = await setup();
    const r = await actions.status({ request: req(statusFd('signed')), params: { id: String(jobId) }, locals: { user: user(tech, 'tech') } });
    assert.deepEqual(r, { ok: true });
    assert.equal((await db.getJob(jobId)).status, 'signed');
    const rows = await db.listNotifications(sales, 10);
    assert.ok(rows.some((n) => n.url === `/jobs/${jobId}` && /signed/.test(n.body)));
  });

  test('restore into a taken slot is 409', async () => {
    const { tech, sales, jobId } = await setup();
    const { y, m, d } = vparts(1);
    await actions.status({ request: req(statusFd('declined')), params: { id: String(jobId) }, locals: { user: user(tech, 'tech') } });
    const b = await db.createJob({
      tech_id: tech, booked_by: sales, client_name: 'Blocker',
      address: '2 Main St, Vancouver, BC V6A 1A1',
      starts_at: db.vancouverWallToEpoch(y, m, d, 10, 0), ends_at: db.vancouverWallToEpoch(y, m, d, 11, 0)
    });
    assert.ok(!('conflict' in b));
    const r = await actions.status({ request: req(statusFd('sent')), params: { id: String(jobId) }, locals: { user: user(tech, 'tech') } });
    assert.equal(r.status, 409);
    assert.equal((await db.getJob(jobId)).status, 'declined');
  });
});

describe('jobs complete action', () => {
  function completeFd(done) {
    const fd = new FormData();
    fd.set('completed', done ? '1' : '0');
    return fd;
  }
  const creq = (fd) => new Request('http://test/jobs/1?/complete', { method: 'POST', body: fd });

  test('completing a non-signed job is 409, others 403', async () => {
    const { tech, tech2, jobId } = await setup();
    let r = await actions.complete({ request: creq(completeFd(true)), params: { id: String(jobId) }, locals: { user: user(tech, 'tech') } });
    assert.equal(r.status, 409);
    r = await actions.complete({ request: creq(completeFd(true)), params: { id: String(jobId) }, locals: { user: user(tech2, 'tech') } });
    assert.equal(r.status, 403);
    r = await actions.complete({ request: creq(completeFd(true)), params: { id: String(jobId) }, locals: {} });
    assert.equal(r.status, 403);
  });

  test('sign then complete then reopen works', async () => {
    const { tech, jobId } = await setup();
    await actions.status({ request: req(statusFd('signed')), params: { id: String(jobId) }, locals: { user: user(tech, 'tech') } });
    let r = await actions.complete({ request: creq(completeFd(true)), params: { id: String(jobId) }, locals: { user: user(tech, 'tech') } });
    assert.deepEqual(r, { ok: true });
    assert.ok((await db.getJob(jobId)).completed_at != null);
    r = await actions.complete({ request: creq(completeFd(false)), params: { id: String(jobId) }, locals: { user: user(tech, 'tech') } });
    assert.deepEqual(r, { ok: true });
    assert.equal((await db.getJob(jobId)).completed_at, null);
  });
});
