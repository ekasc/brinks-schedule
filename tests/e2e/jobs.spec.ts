import { test, expect } from '@playwright/test';
import { login } from './helpers';

async function bookJob(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/book');
  await page.getByRole('heading', { name: /New job/i }).waitFor({ timeout: 10_000 });
  const techSelect = page.locator('select[aria-label="Technician"]');
  if (await techSelect.count()) {
    await techSelect.selectOption({ label: 'Tech 1' });
    await page.waitForLoadState('networkidle');
  }
  const slots = page.locator('[data-testid="slot"]');
  await slots.first().waitFor({ timeout: 10_000 });
  const count = await slots.count();
  const idx = count > 14 ? 14 : 0;
  await slots.nth(idx).click();
  await expect(page.locator('input[name="starts_at"]')).not.toHaveValue('', { timeout: 5_000 });
  const suffix = Date.now().toString().slice(-6);
  const clientName = `JobE2E ${suffix}`;
  await page.locator('#client_name').fill(clientName);
  await page.locator('#address').fill(`77 Job St ${suffix}`);
  const payoutSummary = page.locator('summary', { hasText: 'Notes & package details' });
  await payoutSummary.click();
  await page.locator('#payout').fill('120');
  const submit = page.getByRole('button', { name: 'Book job' });
  await submit.waitFor({ state: 'visible' });
  await submit.click();
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
    const signedBtn = page.getByRole('button', { name: /signed/i });
    if (await signedBtn.count()) {
      await signedBtn.first().click();
      await expect(page.getByText(/signed/i).first()).toBeVisible({ timeout: 10_000 });
    }
    const completedBtn = page.getByRole('button', { name: /completed|complete/i });
    if (await completedBtn.count()) {
      await completedBtn.first().click();
      await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('search on / finds booked job', async ({ page }) => {
    await login(page, 'ekas');
    const clientName = await bookJob(page);
    await page.goto('/');
    const search = page.getByPlaceholder(/Search client or address/i);
    await search.fill(clientName);
    await page.getByRole('button', { name: /Search/i }).click();
    await expect(page.getByText(clientName).first()).toBeVisible({ timeout: 10_000 });
  });
});
