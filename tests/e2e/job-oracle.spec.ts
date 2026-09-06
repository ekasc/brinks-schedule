import { test, expect } from '@playwright/test';
import Database from 'better-sqlite3';
import { login, clearAuth } from './helpers';

const DB_PATH = process.env.DB_PATH || '/tmp/brinks-test-e2e.db';
const timeSlots = (page: import('@playwright/test').Page) => page.locator('#sec-time .slot-grid button');

test.describe('cross-tech job existence oracle', () => {
  test("another tech's job loads as Not Found, same as a nonexistent id", async ({ page, context }) => {
    const db = new Database(DB_PATH);
    const t2 = db.prepare('SELECT id FROM users WHERE username = ?').get('tech2') as { id: number };
    db.close();

    // Book a job assigned to Tech 2.
    await login(page, 'ekas');
    await page.goto(`/book?tech=${t2.id}`);
    await expect(page.getByRole('heading', { name: /New job/i })).toBeVisible();
    const slots = timeSlots(page);
    await expect(slots.first()).toBeVisible({ timeout: 10_000 });
    await slots.first().click();
    await page.getByRole('textbox', { name: 'Full name (required)' }).fill(`E2E Oracle ${Date.now().toString().slice(-6)}`);
    await page.getByRole('combobox', { name: 'Address line (required)' }).fill(`9 Oracle St ${Date.now().toString().slice(-4)}`);
    await page.getByPlaceholder('City *').fill('Vancouver');
    await page.getByPlaceholder('Province *').fill('BC');
    await page.getByPlaceholder('Postal code *').fill('V6A 1A1');
    await page.locator('#sec-book').getByRole('button', { name: 'Book job' }).click();
    await page.locator('#sec-book').getByRole('button', { name: 'Yes' }).click();
    await page.waitForURL(/\/jobs\/\d+/, { timeout: 15_000 });
    const jobUrl = page.url();
    await clearAuth(page, context);

    // Tech 1 sees Tech 2's job exactly as a nonexistent one: branded Not Found.
    await login(page, 'tech1');
    await page.goto(jobUrl);
    await expect(page.getByText('Not found')).toBeVisible({ timeout: 10_000 });
    await page.goto('/jobs/999999');
    await expect(page.getByText('Not found')).toBeVisible({ timeout: 10_000 });
  });
});
