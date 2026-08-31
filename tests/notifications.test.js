import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let db;
let dir;

beforeAll(async () => {
  dir=mkdtempSync(join(tmpdir(),'schedule-notifications-'));
  db=await import('../src/lib/server/db.ts');
  db.__setTestDbPath(join(dir,'test.db'));
  await db.listUsers();
});

afterAll(() => {
  db.__setTestDbPath(null);
  rmSync(dir,{recursive:true,force:true});
});

describe('durable notifications', () => {
  test('deduplicates, counts, and marks notifications read', async () => {
    const userId=await db.createUser(`notify_${Date.now()}`,'pass123','tech','Notify Tech');
    const first=await db.createNotification(userId,'New booking','Test body','/jobs/1','job:1:created');
    const duplicate=await db.createNotification(userId,'New booking','Test body','/jobs/1','job:1:created');
    expect(first).toBeGreaterThan(0);
    expect(duplicate).toBe(0);
    expect(await db.countUnreadNotifications(userId)).toBe(1);
    const rows=await db.listNotifications(userId,10);
    expect(rows).toHaveLength(1);
    expect(await db.markNotificationRead(rows[0].id,userId)).toBe(true);
    expect(await db.countUnreadNotifications(userId)).toBe(0);
  });

  test('leases each pending push delivery once', async () => {
    const userId=await db.createUser(`push_${Date.now()}`,'pass123','tech','Push Tech');
    await db.upsertPushSubscription(userId,'https://push.example/sub','p'.repeat(65),'a'.repeat(24));
    await db.createNotification(userId,'Reminder','One job today','/','daily:2030-01-01');
    const first=await db.claimPendingPushDeliveries(10,Math.floor(Date.now()/1000)+120);
    const second=await db.claimPendingPushDeliveries(10,Math.floor(Date.now()/1000)+120);
    expect(first).toHaveLength(1);
    expect(JSON.parse(first[0].payload).title).toBe('Reminder');
    expect(second).toHaveLength(0);
    await db.completePushDelivery(first[0].delivery_id);
  });
});
