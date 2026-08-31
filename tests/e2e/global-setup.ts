import fs from 'node:fs';
import path from 'node:path';
import * as db from '../../src/lib/server/db';

const DB_PATH = '/tmp/brinks-test-e2e.db';

export default async function globalSetup() {
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  // Use the same schema/migration path as the application: set test DB and
  // trigger ensureSchemaOnce via a simple query. This guarantees E2E and prod
  // share one schema, so SAFE_JOB_COLS never hits "no such column".
  db.__setTestDbPath(DB_PATH);
  await db.listUsers();

  const users: [string, string, string, string][] = [
    ['admin', 'changeme', 'admin', 'Admin'],
    ['admin_esc', 'changeme', 'admin', 'Admin (esc)'],
    ['ekas', 'changeme', 'sales', 'Ekas'],
    ['raman', 'changeme', 'sales', 'Raman'],
    ['tech1', 'changeme', 'tech', 'Tech 1'],
    ['tech2', 'changeme', 'tech', 'Tech 2'],
  ];

  for (const [u, pw, role, name] of users) {
    await db.createUser(u, pw, role as any, name);
  }

  const tech1 = await db.findUserByUsername('tech1');
  const tech2 = await db.findUserByUsername('tech2');
  if (!tech1 || !tech2) throw new Error('seed failed');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = Math.floor(today.getTime() / 1000);

  for (let d = 0; d < 14; d++) {
    const dayStart = todayStart + d * 86400;
    await db.addAvailability(tech1.id, dayStart + 9 * 3600, dayStart + 17 * 3600, 'e2e block');
    await db.addAvailability(tech2.id, dayStart + 9 * 3600, dayStart + 17 * 3600, 'e2e block');
  }

  console.log(`[global-setup] seeded ${DB_PATH} via app schema with ${users.length} users + 14 days availability`);
}
