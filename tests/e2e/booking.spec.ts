import { test, expect } from '@playwright/test';
import { login } from './helpers';

const timeSlots = (page: import('@playwright/test').Page) => page.locator('#sec-time .slot-grid button');

test.describe('booking', () => {
  test('sales can open /book and sees available slots', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/book');
    await expect(page.getByRole('heading', { name: /New job/i })).toBeVisible();
    await expect(page.getByText('Schedule', { exact: true }).last()).toBeVisible();
    await expect(timeSlots(page).first()).toBeVisible({ timeout: 10_000 });
  });

  test('tech cannot access /book (redirects to /)', async ({ page }) => {
    await login(page, 'tech1');
    await page.goto('/book');
    await expect(page).toHaveURL('/');
  });

  test('sales can book a job end-to-end', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/book');
    await expect(page.getByRole('heading', { name: /New job/i })).toBeVisible();

    const slots = timeSlots(page);
    await expect(slots.first()).toBeVisible({ timeout: 10_000 });
    const count = await slots.count();
    const idx = count > 15 ? 14 : Math.min(5, count - 1);
    await slots.nth(idx).click();
    await expect(page.locator('input[name="starts_at"]')).not.toHaveValue('', { timeout: 5_000 });

    const suffix = Date.now().toString().slice(-6);
    const clientName = `E2E Client ${suffix}`;
    const address = `123 Test St #${suffix}, Vancouver`;

    await page.getByRole('textbox', { name: 'Full name (required)' }).fill(clientName);
    await page.getByRole('combobox', { name: 'Address (required)' }).fill(address);

    await page.getByRole('textbox', { name: 'Price in dollars' }).fill('150');

    const submit = page.locator('#sec-book').getByRole('button', { name: 'Book job' });
    await expect(submit).toBeEnabled();
    await submit.click();
    await page.locator('#sec-book').getByRole('button', { name: 'Yes' }).click();

    await page.waitForURL(/\/jobs\/\d+/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/jobs\/\d+/);
    await expect(page.getByText(clientName).first()).toBeVisible();
  });

  test('booking requires client name and address', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/book');

    const slots = timeSlots(page);
    if (await slots.count()) await slots.first().click();

    const submit = page.locator('#sec-book').getByRole('button', { name: 'Book job' });
    await expect(submit).toBeDisabled();
  });

  test('booked job appears on calendar', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/book');
    const slots = timeSlots(page);
    await expect(slots.first()).toBeVisible({ timeout: 10_000 });
    // pick earliest slot to stay within current week (w=0)
    await slots.first().click();
    await expect(page.locator('input[name="starts_at"]')).not.toHaveValue('', { timeout: 5_000 });
    const suffix2 = Date.now().toString().slice(-6);
    const clientName2 = `Cal Check ${suffix2}`;
    await page.getByRole('textbox', { name: 'Full name (required)' }).fill(clientName2);
    await page.getByRole('combobox', { name: 'Address (required)' }).fill(`999 Cal St ${suffix2}`);
    await page.getByRole('textbox', { name: 'Price in dollars' }).fill('200');
    await page.locator('#sec-book').getByRole('button', { name: 'Book job' }).click();
    await page.locator('#sec-book').getByRole('button', { name: 'Yes' }).click();
    await page.waitForURL(/\/jobs\/\d+/);
    await page.goto(`/calendar?q=${encodeURIComponent(clientName2)}`);
    await expect(page.getByText(clientName2).first()).toBeVisible({ timeout: 10_000 });
  });
});
