import { test, expect } from '@playwright/test';
import { login, clearAuth } from './helpers';

const timeSlots = (page: import('@playwright/test').Page) => page.locator('#sec-time .slot-grid button');

async function bookJob(page: import('@playwright/test').Page, clientName: string) {
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: /New job/i })).toBeVisible();
  const slots = timeSlots(page);
  await expect(slots.first()).toBeVisible({ timeout: 10_000 });
  await slots.first().click();
  await page.getByRole('textbox', { name: 'Full name (required)' }).fill(clientName);
  await page.getByRole('combobox', { name: 'Address line (required)' }).fill(`77 Edit St ${Date.now().toString().slice(-4)}`);
  await page.getByPlaceholder('City *').fill('Vancouver');
  await page.getByPlaceholder('Province *').fill('BC');
  await page.getByPlaceholder('Postal code *').fill('V6A 1A1');
  await page.locator('#sec-book').getByRole('button', { name: 'Book job' }).click();
  await page.locator('#sec-book').getByRole('button', { name: 'Yes' }).click();
  await page.waitForURL(/\/jobs\/\d+/, { timeout: 15_000 });
}

test.describe('job edit / decline / delete', () => {
  test('sales can edit notes, decline, restore and delete a job', async ({ page }) => {
    await login(page, 'ekas');
    const clientName = `E2E Edit ${Date.now().toString().slice(-6)}`;
    await bookJob(page, clientName);
    const jobUrl = page.url();

    // Edit notes.
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: /Edit job/i })).toBeVisible();
    await page.getByRole('textbox', { name: 'Notes' }).fill('Ring twice please');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForURL(/\/jobs\/\d+$/, { timeout: 15_000 });
    await expect(page.getByText('Ring twice please')).toBeVisible();

    // Decline with two-tap confirm.
    await page.getByRole('button', { name: 'Decline' }).click();
    await page.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText('Declined').first()).toBeVisible({ timeout: 10_000 });

    // Restore back to sent.
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('Sent').first()).toBeVisible({ timeout: 10_000 });

    // Delete with two-tap confirm lands home; the old URL is a branded 404.
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Delete job…' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForURL('/', { timeout: 15_000 });
    await page.goto(jobUrl);
    await expect(page.getByText('Not found')).toBeVisible({ timeout: 10_000 });
  });

  test('tech cannot delete (no danger zone)', async ({ page, context }) => {
    await login(page, 'ekas');
    const clientName = `E2E Nodelete ${Date.now().toString().slice(-6)}`;
    await bookJob(page, clientName);
    const jobUrl = page.url();
    await clearAuth(page, context);

    await login(page, 'tech1');
    await page.goto(jobUrl);
    await expect(page.getByText(clientName).first()).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: /Edit job/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Delete job/ })).toHaveCount(0);
  });
});
