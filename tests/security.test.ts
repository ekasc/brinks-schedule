import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { csvCell } from '../src/lib/server/csv';
import { isAllowedPushEndpoint } from '../src/lib/server/pushEndpoint';
import * as db from '../src/lib/server/db';
import * as auth from '../src/lib/server/auth';

let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'schedule-security-'));
  db.__setTestDbPath(join(dir, 'test.db'));
  await db.listUsers();
});

afterAll(() => {
  db.__setTestDbPath(null);
  rmSync(dir, { recursive: true, force: true });
});

describe('session revocation', () => {
  test('disabled users cannot login or reuse a session', async () => {
    const id = await db.createUser(`disabled_${Date.now()}`, 'strongpass', 'tech', 'Disabled');
    const user = await db.findUserById(id);
    expect(user).toBeDefined();
    const token = auth.sign({ uid: id, role: 'tech', username: user!.username, sv: user!.session_version! });
    await db.setUserActive(id, false);
    expect(await auth.authenticate(user!.username, 'strongpass')).toBeNull();
    expect(await auth.userFromCookie(`bs_session=${token}`)).toBeNull();
  });

  test('password changes revoke existing sessions', async () => {
    const id = await db.createUser(`reset_${Date.now()}`, 'strongpass', 'sales', 'Reset');
    const user = await db.findUserById(id);
    expect(user).toBeDefined();
    const token = auth.sign({ uid: id, role: 'sales', username: user!.username, sv: user!.session_version! });
    await db.updatePassword(id, 'differentpass');
    expect(await auth.userFromCookie(`bs_session=${token}`)).toBeNull();
  });
});

describe('boundary validation', () => {
  test('push delivery only permits known browser push services', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/QH/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://attacker.example/push')).toBe(false);
    expect(isAllowedPushEndpoint('https://127.0.0.1/push')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.attacker.example/push')).toBe(false);
  });

  test('CSV cells neutralize spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("https://evil")')).toBe('"\'=HYPERLINK(""https://evil"")"');
    expect(csvCell('+1+1')).toBe('"\'+1+1"');
    expect(csvCell('normal')).toBe('"normal"');
  });

  test('login failures block and successful login clears the key', async () => {
    const key = `rate-${Date.now()}`;
    for (let i = 0; i < 5; i++) await db.recordLoginResult(key, false);
    expect(await db.isLoginAllowed(key)).toBe(false);
    await db.recordLoginResult(key, true);
    expect(await db.isLoginAllowed(key)).toBe(true);
  });
});
