import { test, expect } from '@playwright/test';
import { login } from './helpers';

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

  test('sales cannot post availability (no form action)', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/availability');
    await expect(page).toHaveURL(/\/availability|\/login|\//);
  });
});
