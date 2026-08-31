import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('booking', () => {
  test('sales can open /book and sees available slots', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/book');
    await expect(page.getByRole('heading', { name: /New job/i })).toBeVisible();
    await expect(page.getByText(/Time & tech/i)).toBeVisible();
    await expect(page.locator('[data-testid="slot"]').first()).toBeVisible({ timeout: 10_000 });
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

    const techSelect = page.locator('select[aria-label="Technician"]');
    if (await techSelect.count()) {
      await techSelect.selectOption({ label: 'Tech 1' });
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="slot"]').first()).toBeVisible({ timeout: 10_000 });
    }

    const timeSlots = page.locator('[data-testid="slot"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10_000 });
    const count = await timeSlots.count();
    const idx = count > 15 ? 14 : Math.min(5, count - 1);
    await timeSlots.nth(idx).click();
    await expect(page.locator('input[name="starts_at"]')).not.toHaveValue('', { timeout: 5_000 });

    const suffix = Date.now().toString().slice(-6);
    const clientName = `E2E Client ${suffix}`;
    const address = `123 Test St #${suffix}, Vancouver`;

    await page.locator('#client_name').fill(clientName);
    await page.locator('#address').fill(address);

    const payoutSummary = page.locator('summary', { hasText: 'Notes & package details' });
    await payoutSummary.click();
    await page.locator('#payout').fill('150');

    const submit = page.getByRole('button', { name: 'Book job' });
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL(/\/jobs\/\d+/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/jobs\/\d+/);
    await expect(page.getByText(clientName).first()).toBeVisible();
  });

  test('booking requires client name and address', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/book');

    const timeSlots = page.locator('[data-testid="slot"]');
    if (await timeSlots.count()) await timeSlots.first().click();

    const submit = page.getByRole('button', { name: 'Book job' });
    await expect(submit).toBeDisabled();
  });

  test('booked job appears on calendar', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/book');
    const techSelect2 = page.locator('select[aria-label="Technician"]');
    if (await techSelect2.count()) {
      await techSelect2.selectOption({ label: 'Tech 1' });
      await page.waitForLoadState('networkidle');
    }
    const timeSlots = page.locator('[data-testid="slot"]');
    await expect(timeSlots.first()).toBeVisible({ timeout: 10_000 });
    // pick earliest slot to stay within current week (w=0)
    await timeSlots.first().click();
    await expect(page.locator('input[name="starts_at"]')).not.toHaveValue('', { timeout: 5_000 });
    const suffix2 = Date.now().toString().slice(-6);
    const clientName2 = `Cal Check ${suffix2}`;
    await page.locator('#client_name').fill(clientName2);
    await page.locator('#address').fill(`999 Cal St ${suffix2}`);
    await page.locator('summary', { hasText: 'Notes & package details' }).click();
    await page.locator('#payout').fill('200');
    await page.getByRole('button', { name: 'Book job' }).click();
    await page.waitForURL(/\/jobs\/\d+/);
    await page.goto(`/calendar?q=${encodeURIComponent(clientName2)}`);
    await expect(page.getByText(clientName2).first()).toBeVisible({ timeout: 10_000 });
  });
});
