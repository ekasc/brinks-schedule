import { describe, test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions as loginActions } from '../src/routes/login/+page.server.ts';

let db;
let tmpDir;
let dbPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-actions-login-'));
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

describe('login action', () => {
  test('missing fields 400, unknown user and wrong password 401', async () => {
    await mkUser('sales', 'Login User', 'correct99');
    let r = await loginActions.default({
      request: req(fd({ username: '', password: '' })),
      cookies: { set() {} }, getClientAddress: () => 'test'
    });
    assert.equal(r.status, 400);
    r = await loginActions.default({
      request: req(fd({ username: 'nobody-here', password: 'whatever99' })),
      cookies: { set() {} }, getClientAddress: () => 'test'
    });
    assert.equal(r.status, 401);
    const u = await mkUser('sales', 'Login User2', 'correct99');
    r = await loginActions.default({
      request: req(fd({ username: u.username, password: 'wrongpass99' })),
      cookies: { set() {} }, getClientAddress: () => 'test'
    });
    assert.equal(r.status, 401);
  });

  test('success sets a session cookie and redirects', async () => {
    const u = await mkUser('sales', 'Login User3', 'correct99');
    let cookie = null;
    const cookies = { set: (...args) => { cookie = args; } };
    let location = '';
    try {
      await loginActions.default({
        request: req(fd({ username: u.username, password: 'correct99' })),
        cookies, getClientAddress: () => 'test'
      });
      assert.fail('expected redirect');
    } catch (e) {
      location = e.location;
      assert.equal(e.status, 303);
    }
    assert.equal(location, '/');
    assert.equal(cookie[0], 'bs_session');
    assert.ok(cookie[1].length > 20);
  });

  test('repeated failures lock the key out with 429', async () => {
    const u = await mkUser('sales', 'Login User4', 'correct99');
    const attempt = () => loginActions.default({
      request: req(fd({ username: u.username, password: 'wrongpass99' })),
      cookies: { set() {} }, getClientAddress: () => 'test-lockout'
    });
    for (let i = 0; i < 5; i++) {
      const r = await attempt();
      assert.equal(r.status, 401);
    }
    const locked = await attempt();
    assert.equal(locked.status, 429);
  });
});
