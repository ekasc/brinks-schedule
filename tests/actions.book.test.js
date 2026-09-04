import { describe, test, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actions as bookActionModule } from '../src/routes/book/+page.server.ts';

const bookAction = bookActionModule.default;

let db;
let tmpDir;
let dbPath;

// Stub the geocode provider: booking tests must be hermetic (no upstream HTTP).
const realFetch = globalThis.fetch;

beforeAll(async () => {
  globalThis.fetch = (async (url, init) => {
    if (String(url).includes('photon.komoot.io')) return new Response('{"features":[]}', { status: 200 });
    return realFetch(url, init);
  });
  tmpDir = mkdtempSync(join(tmpdir(), 'brinks-actions-book-'));
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
  return { y: p.year, m: p.month, d: p.day, dow: p.dow };
}
function bookFd(overrides = {}) {
  const fd = new FormData();
  const base = {
    client_name: 'Book Client', street: '5 Main St', city: 'Vancouver', province: 'BC',
    postal_code: 'V6A 2S7', email: '', phone: '', dob: '', telus_pin: '', id_type: '',
    id_last4: '', emergency_name: '', emergency_number: '', emergency_relation: '',
    verbal_password: '', security_offered: '', notes: '', price: '',
    tech_id: '', starts_at: '', ends_at: ''
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, String(v));
  return fd;
}
const req = (fd) => new Request('http://test/book', { method: 'POST', body: fd });
const user = (id, role) => ({ id, role, username: `${role}${id}`, display_name: `${role}${id}` });

async function setupTech() {
  const tech = await mkUser('tech', 'BookAct Tech');
  const sales = await mkUser('sales', 'BookAct Sales');
  const { dow } = vparts(1);
  await db.setPatternsForTech(tech, [{ dow, start_min: 540, end_min: 1020 }]);
  return { tech, sales };
}
async function firstSlot(tech) {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);
  const slots = await db.getAvailableSlots(tech, {
    fromTs: Math.floor(Date.now() / 1000), toTs: Math.floor(horizon.getTime() / 1000), durationMin: 90
  });
  assert.ok(slots.length > 0, 'setup needs an available slot');
  return slots[0];
}

describe('book action', () => {
  test('tech role and anonymous callers are rejected', async () => {
    const { tech } = await setupTech();
    let r = await bookAction({ request: req(bookFd({ tech_id: String(tech) })), locals: { user: user(tech, 'tech') } });
    assert.equal(r.status, 403);
    r = await bookAction({ request: req(bookFd({ tech_id: String(tech) })), locals: {} });
    assert.equal(r.status, 403);
  });

  test('invalid time slot is 400, unavailable slot is 409', async () => {
    const { tech, sales } = await setupTech();
    const loc = { user: user(sales, 'sales') };
    let r = await bookAction({ request: req(bookFd({ tech_id: String(tech), starts_at: 'nope', ends_at: '' })), locals: loc });
    assert.equal(r.status, 400);
    const future = Math.floor(Date.now() / 1000) + 86400;
    r = await bookAction({
      request: req(bookFd({ tech_id: String(tech), starts_at: String(future), ends_at: String(future + 5400) })),
      locals: loc
    });
    assert.equal(r.status, 409);
  });

  test('inactive tech cannot accept bookings', async () => {
    const { tech, sales } = await setupTech();
    await db.setUserActive(tech, false);
    const future = Math.floor(Date.now() / 1000) + 86400;
    const r = await bookAction({
      request: req(bookFd({ tech_id: String(tech), starts_at: String(future), ends_at: String(future + 5400) })),
      locals: { user: user(sales, 'sales') }
    });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /not available/);
  });

  test('full booking succeeds offline and redirects unmapped', async () => {
    const { tech, sales } = await setupTech();
    const slot = await firstSlot(tech);
    let location = '';
    try {
      await bookAction({
        request: req(bookFd({ tech_id: String(tech), starts_at: String(slot.starts_at), ends_at: String(slot.ends_at) })),
        locals: { user: user(sales, 'sales') }
      });
      assert.fail('expected redirect');
    } catch (e) {
      location = e.location;
      assert.equal(e.status, 303);
    }
    assert.match(location, /^\/jobs\/\d+\?unmapped=1$/);
    const id = Number(location.split('/')[2].split('?')[0]);
    const job = await db.getJob(id);
    assert.equal(job.client_name, 'Book Client');
    assert.equal(job.tech_id, tech);
    // Booker flow notifies the tech (enqueue-only, no push in request path).
    const rows = await db.listNotifications(tech, 10);
    assert.ok(rows.some((n) => n.url === `/jobs/${id}`));
  });
});
