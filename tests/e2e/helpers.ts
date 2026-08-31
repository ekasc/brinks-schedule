import type { Page, BrowserContext } from '@playwright/test';
import { expect } from '@playwright/test';

export async function login(page: Page, username: string, password = 'changeme') {
  await page.goto('/login');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 }),
    page.getByRole('button', { name: 'Sign In' }).click(),
  ]);
}

export async function logout(page: Page) {
  await page.goto('/logout');
}

export async function loginAs(page: Page, role: 'admin' | 'sales' | 'tech') {
  const map = {
    admin: 'admin',
    sales: 'ekas',
    tech: 'tech1',
  } as const;
  await login(page, map[role]);
}

export function uniqueUsername(prefix = 'e2e') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function expectOnLogin(page: Page) {
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible();
}

export async function clearAuth(page: Page, context: BrowserContext) {
  await context.clearCookies();
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  } catch {}
  await context.clearCookies();
}
