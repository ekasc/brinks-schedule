import { test, expect } from '@playwright/test';
import { login, clearAuth } from './helpers';

test.describe('auth', () => {
  test('unauthenticated / redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated /book redirects to /login', async ({ page }) => {
    await page.goto('/book');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('wrongpass');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('.err, [role="alert"]')).toContainText(/Wrong username or password/i, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('login with empty fields shows validation', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('sales can login and sees Today', async ({ page }) => {
    await login(page, 'ekas');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  });

  test('admin can login', async ({ page }) => {
    await login(page, 'admin');
    await expect(page).toHaveURL(/\/clients/);
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();
  });

  test('tech can login', async ({ page }) => {
    await login(page, 'tech1');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  });

  test('logged-in user visiting /login is redirected to /', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/login');
    await expect(page).toHaveURL(/\/clients/);
  });

  test('logout clears session and protects /', async ({ page, context }) => {
    await login(page, 'ekas');
    await expect(page).toHaveURL('/');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);

    await clearAuth(page, context);
  });

  test('service worker does not cache __data or return JSON after login (no hard reset needed)', async ({ page, context }) => {
    await login(page, 'ekas');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
    const content = await page.content();
    expect(content).not.toContain('"appVersion"');
    expect(content).not.toContain('"attention"');
  });
});
