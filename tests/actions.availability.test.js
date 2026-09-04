import { describe, test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions as availActions } from '../src/routes/availability/+page.server.ts';

let db;
let tmpDir;
let dbPath;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-actions-avail-'));
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

describe('availability savePatterns action', () => {
  test('sales rejected, tech cannot save for another tech', async () => {
    const tech = await mkUser('tech', 'Av Tech');
    const tech2 = await mkUser('tech', 'Av Tech2');
    const sales = await mkUser('sales', 'Av Sales');
    const patterns = JSON.stringify([{ dow: 1, start_min: 540, end_min: 1020 }]);
    let r = await availActions.savePatterns({
      request: req(fd({ tech_id: String(tech.id), patterns })), locals: { user: { id: sales.id, role: 'sales' } }
    });
    assert.equal(r.status, 403);
    r = await availActions.savePatterns({
      request: req(fd({ tech_id: String(tech2.id), patterns })), locals: { user: { id: tech.id, role: 'tech' } }
    });
    assert.equal(r.status, 403);
    assert.deepEqual(await db.listTemplates(tech.id), []);
  });

  test('invalid patterns rejected, valid patterns stored', async () => {
    const tech = await mkUser('tech', 'Av Tech3');
    const loc = { user: { id: tech.id, role: 'tech' } };
    const bad = [
      JSON.stringify([{ dow: 7, start_min: 540, end_min: 1020 }]),
      JSON.stringify([{ dow: 1, start_min: 1020, end_min: 540 }]),
      JSON.stringify([{ dow: 1, start_min: 540, end_min: 1020, kind: 'x' }]),
      'not-json'
    ];
    for (const patterns of bad) {
      const r = await availActions.savePatterns({ request: req(fd({ patterns })), locals: loc });
      assert.equal(r.status, 400);
    }
    const good = JSON.stringify([
      { dow: 1, start_min: 540, end_min: 1020 },
      { dow: 3, start_min: 600, end_min: 900 }
    ]);
    const r = await availActions.savePatterns({ request: req(fd({ patterns: good })), locals: loc });
    assert.deepEqual(r, { ok: true });
    const stored = await db.listTemplates(tech.id);
    assert.deepEqual(stored.map((t) => [t.dow, t.start_min, t.end_min]).sort(), [[1, 540, 1020], [3, 600, 900]]);
  });
});
