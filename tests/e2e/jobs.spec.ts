import { test, expect } from '@playwright/test';
import { login } from './helpers';

async function bookJob(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/book');
  await page.getByRole('heading', { name: /New job/i }).waitFor({ timeout: 10_000 });
  const slots = page.locator('#sec-time .slot-grid button');
  await slots.first().waitFor({ timeout: 10_000 });
  await slots.first().click();
  await expect(page.locator('input[name="starts_at"]')).not.toHaveValue('', { timeout: 5_000 });
  const suffix = Date.now().toString().slice(-6);
  const clientName = `JobE2E ${suffix}`;
  await page.getByRole('textbox', { name: 'Full name (required)' }).fill(clientName);
  await page.getByRole('combobox', { name: 'Address line (required)' }).fill(`77 Job St ${suffix}`);
  await page.getByPlaceholder('City *').fill('Vancouver');
  await page.getByPlaceholder('Province *').fill('BC');
  await page.getByPlaceholder('Postal code *').fill('V6A 1A1');
  await page.getByRole('textbox', { name: 'Price in dollars' }).fill('120');
  const submit = page.locator('#sec-book').getByRole('button', { name: 'Book job' });
  await submit.waitFor({ state: 'visible' });
  await submit.click();
  await page.locator('#sec-book').getByRole('button', { name: 'Yes' }).click();
  await page.waitForURL(/\/jobs\/\d+/, { timeout: 15_000 });
  return clientName;
}

test.describe('jobs', () => {
  test('job detail shows status and actions', async ({ page }) => {
    await login(page, 'ekas');
    const clientName = await bookJob(page);
    await expect(page.getByRole('heading', { level: 1, name: clientName })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/sent|signed|cancelled/i).first()).toBeVisible();
  });

  test('can change status and mark completed', async ({ page }) => {
    await login(page, 'ekas');
    const clientName = await bookJob(page);
    await page.getByRole('button', { name: 'Mark Signed' }).click();
    await page.getByRole('button', { name: 'Yes' }).click();
    const completedBtn = page.getByRole('button', { name: 'Mark install completed' });
    await expect(completedBtn).toBeVisible({ timeout: 10_000 });
    await completedBtn.click();
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('search on calendar finds booked job', async ({ page }) => {
    await login(page, 'ekas');
    const clientName = await bookJob(page);
    await page.getByRole('button', { name: 'Mark Signed' }).click();
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByRole('button', { name: 'Mark install completed' })).toBeVisible({ timeout: 10_000 });
    await page.goto(`/calendar?q=${encodeURIComponent(clientName)}`);
    await expect(page.getByText(clientName).first()).toBeVisible({ timeout: 10_000 });
  });
});
