import { describe, test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions as adminActions } from '../src/routes/admin/+page.server.ts';

let db;
let tmpDir;
let dbPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-actions-misc-'));
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

async function mkUser(role, name, password = 'pass1234') {
  const username = `${name.toLowerCase().replace(/[^a-z0-9._-]/g, '')}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const id = await db.createUser(username, password, role, name);
  return { id, username, role };
}
function fd(obj) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, String(v));
  return f;
}
const req = (f, path = '/') => new Request(`http://test${path}`, { method: 'POST', body: f });
const adminLoc = (admin) => ({ user: { id: admin.id, role: 'admin', username: admin.username, display_name: 'Admin' } });

describe('admin actions', () => {
  test('non-admins are rejected', async () => {
    const sales = await mkUser('sales', 'Adm Sales');
    const r = await adminActions.create({
      request: req(fd({ display_name: 'X', username: 'x_y_z', password: 'pass1234', role: 'tech' })),
      locals: { user: { id: sales.id, role: 'sales', username: sales.username, display_name: 'S' } }
    });
    assert.equal(r.status, 403);
  });

  test('create validates, dedupes and stores', async () => {
    const admin = await mkUser('admin', 'Adm Root');
    const loc = adminLoc(admin);
    let r = await adminActions.create({
      request: req(fd({ display_name: 'X', username: 'ab', password: 'pass1234', role: 'tech' })), locals: loc
    });
    assert.equal(r.status, 400);
    r = await adminActions.create({
      request: req(fd({ display_name: 'New Tech', username: 'newtech', password: 'short', role: 'tech' })), locals: loc
    });
    assert.equal(r.status, 400);
    r = await adminActions.create({
      request: req(fd({ display_name: 'New Tech', username: 'newtech', password: 'pass1234', role: 'tech' })), locals: loc
    });
    assert.deepEqual(r, { ok: true });
    r = await adminActions.create({
      request: req(fd({ display_name: 'Dupe', username: 'newtech', password: 'pass1234', role: 'sales' })), locals: loc
    });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /taken/);
    const found = await db.findUserByUsername('newtech');
    assert.equal(found.role, 'tech');
  });

  test('edit changes role and password, rejects dupes', async () => {
    const admin = await mkUser('admin', 'Adm Root2');
    const loc = adminLoc(admin);
    const target = await mkUser('sales', 'Adm Target', 'oldpass99');
    let r = await adminActions.edit({
      request: req(fd({ id: String(target.id), display_name: 'Adm Target', username: target.username, role: 'tech', password: '' })),
      locals: loc
    });
    assert.deepEqual(r, { ok: true });
    assert.equal((await db.findUserById(target.id)).role, 'tech');

    r = await adminActions.edit({
      request: req(fd({ id: String(target.id), display_name: 'Adm Target', username: target.username, role: 'tech', password: 'brandnew99' })),
      locals: loc
    });
    assert.deepEqual(r, { ok: true });
    assert.ok(db.verifyPassword(await db.findUserByIdFull(target.id), 'brandnew99'));

    const other = await mkUser('sales', 'Adm Other');
    r = await adminActions.edit({
      request: req(fd({ id: String(target.id), display_name: 'Adm Target', username: other.username, role: 'tech', password: '' })),
      locals: loc
    });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /taken/);
  });
});
