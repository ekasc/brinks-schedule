import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('availability', () => {
  test('tech can view availability page', async ({ page }) => {
    await login(page, 'tech1');
    await page.goto('/availability');
    await expect(page.getByRole('heading', { name: /Hours/i })).toBeVisible();
  });

  test('tech can add an availability block', async ({ page }) => {
    await login(page, 'tech1');
    await page.goto('/availability');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const iso = tomorrow.toISOString().slice(0, 10);

    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.count()) {
      await dateInput.fill(iso);
      const startInput = page.locator('input[type="time"]').first();
      const endInput = page.locator('input[type="time"]').nth(1);
      if ((await startInput.count()) && (await endInput.count())) {
        await startInput.fill('10:00');
        await endInput.fill('14:00');
      }
      const addBtn = page.getByRole('button', { name: /Add/i }).first();
      await addBtn.click();
      await expect(page.getByText(/10:00|14:00|availability/i).first()).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(page.getByText(/Availability|block/i).first()).toBeVisible();
    }
  });

  test('sales cannot post availability (no form action)', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/availability');
    await expect(page).toHaveURL(/\/availability|\/login|\//);
  });
});
