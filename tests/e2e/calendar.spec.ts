import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('calendar rolling week', () => {
  test('sales week view shows the rolling 7 days', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/calendar');
    await expect(page.getByText('Next 7 days')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('link', { name: 'Next week' }).click();
    await expect(page).toHaveURL(/w=1/);
    await expect(page.getByText('1 week ahead')).toBeVisible();

    await page.getByRole('link', { name: 'Previous week' }).click();
    await expect(page).toHaveURL(/w=0/);
    await expect(page.getByText('Next 7 days')).toBeVisible();

    await page.getByRole('link', { name: 'Previous week' }).click();
    await expect(page).toHaveURL(/w=-1/);
    await expect(page.getByText('1 week ago')).toBeVisible();
  });

  test('tech week view shows the rolling 7 days', async ({ page }) => {
    await login(page, 'tech1');
    await page.goto('/calendar');
    await expect(page.getByText('Next 7 days')).toBeVisible({ timeout: 10_000 });
    // Tech sees only their own row — the other tech never appears.
    await expect(page.getByText('Tech 2')).toHaveCount(0);
  });
});
