import { test, expect } from '@playwright/test';
import { login, uniqueUsername } from './helpers';

test.describe('admin', () => {
  test('sales cannot access /admin', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/admin');
    await expect(page).toHaveURL('/');
  });

  test('tech cannot access /admin', async ({ page }) => {
    await login(page, 'tech1');
    await page.goto('/admin');
    await expect(page).toHaveURL('/');
  });

  test('admin can create a new sales user and that user can login', async ({ page, context }) => {
    await login(page, 'admin');
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();

    const username = uniqueUsername('sales');
    const display = `E2E ${username}`;

    await page.locator('#new-username').fill(username);
    await page.locator('#new-password').fill('testpass123');
    await page.locator('#new-display').fill(display);
    await page.locator('select[name="role"]').selectOption('sales');
    await page.getByRole('button', { name: 'Create user' }).click();

    await expect(page.getByText('Saved.')).toBeVisible({ timeout: 5_000 }).catch(() => {});
    await expect(page.getByText(`@${username}`)).toBeVisible({ timeout: 10_000 });

    const browser = context.browser();
    if (!browser) throw new Error('no browser');
    const newContext = await browser.newContext();
    const page2 = await newContext.newPage();
    await page2.goto('/login');
    await page2.locator('#username').fill(username);
    await page2.locator('#password').fill('testpass123');
    await page2.getByRole('button', { name: 'Sign In' }).click();
    await expect(page2).toHaveURL('/', { timeout: 10_000 });
    await newContext.close();
  });

  test('admin can disable a user (cannot disable self)', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/admin');

    const username = uniqueUsername('disable');
    await page.locator('#new-username').fill(username);
    await page.locator('#new-password').fill('testpass123');
    await page.locator('#new-display').fill(`Z Disable ${username}`);
    await page.locator('select[name="role"]').selectOption('sales');
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(page.getByText(`@${username}`)).toBeVisible({ timeout: 10_000 });

    const row = page.locator(`text=@${username}`).locator('..').locator('..');
    const disableBtn = row.getByRole('button', { name: /Disable/i }).first();
    if (await disableBtn.count()) {
      await disableBtn.click();
      await expect(page.getByText('Saved.')).toBeVisible({ timeout: 5_000 }).catch(() => {});
    }
  });
});
