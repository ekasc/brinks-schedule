import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { login } from './helpers';

const DB_PATH = process.env.DB_PATH || '/tmp/brinks-test-e2e.db';

test.describe('booking multi-tech switching', () => {
  // Snapshot tech1's templates: this suite shares one seeded DB across spec
  // files (global-setup runs once), so any rows we delete must be restored.
  let saved: { dow: number; start_min: number; end_min: number }[] = [];
  let tech1Id = 0;
  test.beforeEach(() => {
    const db = new Database(DB_PATH);
    tech1Id = (db.prepare('SELECT id FROM users WHERE username = ?').get('tech1') as { id: number }).id;
    saved = db.prepare('SELECT dow, start_min, end_min FROM availability_templates WHERE tech_id = ?').all(tech1Id) as typeof saved;
    db.prepare('DELETE FROM availability_templates WHERE tech_id = ?').run(tech1Id);
    db.close();
  });
  test.afterEach(() => {
    const db = new Database(DB_PATH);
    db.prepare('DELETE FROM availability_templates WHERE tech_id = ?').run(tech1Id);
    const ins = db.prepare('INSERT INTO availability_templates (tech_id, dow, start_min, end_min) VALUES (?, ?, ?, ?)');
    for (const r of saved) ins.run(tech1Id, r.dow, r.start_min, r.end_min);
    db.close();
  });
  test('switching from an hour-less tech to one with hours shows its slots', async ({ page }) => {
    // Tech 1 (preselected first) has NO hours; Tech 2 keeps seeded Mon-Fri hours.
    await login(page, 'ekas');
    await page.goto('/book');
    await expect(page.getByRole('heading', { name: /New job/i })).toBeVisible();

    // Tech 1 preselected -> empty state.
    await expect(page.getByText('No hours posted')).toBeVisible({ timeout: 10_000 });

    // Switch to Tech 2 via the Schedule select.
    await page.locator('#sec-schedule button').first().click();
    await page.getByRole('option', { name: 'Tech 2' }).click();

    // Selection sticks (hidden tech_id drives the booking) and Tech 2's slots appear.
    const t2 = (() => {
      const d = new Database(DB_PATH);
      const row = d.prepare('SELECT id FROM users WHERE username = ?').get('tech2') as { id: number };
      d.close();
      return row;
    })();
    await expect(page.locator('input[name="tech_id"]')).toHaveValue(String(t2.id));
    await expect(page.locator('#sec-time .slot-grid button').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No hours posted')).toHaveCount(0);
  });
});
