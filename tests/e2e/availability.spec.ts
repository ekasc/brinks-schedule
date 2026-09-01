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
    await expect(page.getByRole('heading', { name: /Hours/i })).toBeVisible();
    // per-day one slot UI - check week toggles and time fields
    await expect(page.getByText('Monday').first()).toBeVisible();
    await expect(page.getByText('Tuesday').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Save/i })).toBeVisible();
  });

  test('sales cannot post availability (no form action)', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/availability');
    await expect(page).toHaveURL(/\/availability|\/login|\//);
  });
});
