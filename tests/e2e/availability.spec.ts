import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { login } from './helpers';

const DB_PATH = process.env.DB_PATH || '/tmp/brinks-test-e2e.db';

// Safety net: the Monday test below toggles tech1's hours. The suite shares
// one seeded DB, so guarantee Monday 9-17 survives even if that test fails
// mid-way (INSERT OR IGNORE keeps existing custom hours).
test.afterEach(async () => {
  const db = new Database(DB_PATH);
  try {
    const t1 = db.prepare('SELECT id FROM users WHERE username = ?').get('tech1') as { id: number };
    db.prepare('INSERT OR IGNORE INTO availability_templates (tech_id, dow, start_min, end_min) VALUES (?, ?, ?, ?)').run(t1.id, 1, 540, 1020);
  } finally {
    db.close();
  }
});

function nextMondayIso(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (1 - day + 7) % 7 || 7; // next Monday strictly after today
  const next = new Date(d);
  next.setDate(d.getDate() + diff);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${p(next.getMonth() + 1)}-${p(next.getDate())}`;
}
function nextMondayIsoIncludingToday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (1 - day + 7) % 7;
  const next = new Date(d);
  next.setDate(d.getDate() + diff);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${p(next.getMonth() + 1)}-${p(next.getDate())}`;
}

test.describe('availability', () => {
  test('tech can view availability page', async ({ page }) => {
    await login(page, 'tech1');
    await page.goto('/availability');
    await expect(page.getByRole('heading', { name: /Hours/i })).toBeVisible();
  });

  test('Monday Off produces zero Monday booking slots', async ({ page }) => {
    const mondayIso = nextMondayIso();

    // Ensure Monday is On
    await login(page, 'tech1');
    await page.goto('/availability');
    await expect(page.getByRole('heading', { name: /Hours/i })).toBeVisible();
    let mondayField = page.locator('div.field').filter({ hasText: 'Monday' }).first();
    await expect(mondayField).toBeVisible();
    const isOn = await mondayField.getByText('09:00 AM').count();
    if (isOn === 0) {
      await mondayField.locator('label.relative').first().click();
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 });
      await page.reload();
      mondayField = page.locator('div.field').filter({ hasText: 'Monday' }).first();
    }
    await expect(mondayField.getByText('09:00 AM')).toBeVisible();
    // Save explicitly to ensure persisted
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 });

    // Sales asserts at least one Monday slot exists
    await page.context().clearCookies();
    await login(page, 'ekas');
    await page.goto('/book');
    await expect(page.getByRole('heading', { name: /New job/i })).toBeVisible();
    // Switch to List view for deterministic DOM
    const listTab = page.getByRole('button', { name: 'List' });
    if (await listTab.count()) await listTab.click();
    await expect(page.locator('#sec-time').getByText(/\d+ slots/)).toBeVisible();
    await expect(page.locator(`[data-slot-date="${mondayIso}"]`)).not.toHaveCount(0, { timeout: 5_000 });

    // Turn Monday Off
    await page.context().clearCookies();
    await login(page, 'tech1');
    await page.goto('/availability');
    mondayField = page.locator('div.field').filter({ hasText: 'Monday' }).first();
    await expect(mondayField).toBeVisible();
    // Ensure On before turning Off
    if ((await mondayField.getByText('09:00 AM').count()) === 0) {
      await mondayField.locator('label.relative').first().click();
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Saved')).toBeVisible();
      await page.reload();
      mondayField = page.locator('div.field').filter({ hasText: 'Monday' }).first();
    }
    await mondayField.locator('label.relative').first().click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 });
    await page.reload();
    mondayField = page.locator('div.field').filter({ hasText: 'Monday' }).first();
    await expect(mondayField.getByText('09:00 AM')).not.toBeVisible();

    // Sales asserts zero Monday slots
    await page.context().clearCookies();
    await login(page, 'ekas');
    await page.goto('/book');
    await expect(page.getByRole('heading', { name: /New job/i })).toBeVisible();
    const listTab2 = page.getByRole('button', { name: 'List' });
    if (await listTab2.count()) await listTab2.click();
    await expect(page.locator('#sec-time').getByText(/\d+ slots/)).toBeVisible();
    await expect(page.locator(`[data-slot-date="${mondayIso}"]`)).toHaveCount(0, { timeout: 5_000 });

    // Restore Monday On for subsequent tests
    await page.context().clearCookies();
    await login(page, 'tech1');
    await page.goto('/availability');
    mondayField = page.locator('div.field').filter({ hasText: 'Monday' }).first();
    if ((await mondayField.getByText('09:00 AM').count()) === 0) {
      await mondayField.locator('label.relative').first().click();
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Saved')).toBeVisible({ timeout: 5_000 });
    }
  });

  test('sales cannot post availability (no Save button, action 403s)', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/availability');
    await expect(page.getByRole('heading', { name: /Hours/i })).toBeVisible();
    await expect(page.getByText('this view is read-only')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    const res = await page.request.post('/availability?/savePatterns', {
      form: { tech_id: '1', patterns: '[]' }
    });
    expect(res.status()).toBe(403);
  });
});
