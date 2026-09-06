import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('route tech/date resync', () => {
  test('browser Back restores the previous tech selection', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/route');
    await expect(page).toHaveURL(/\/route/);
    await page.getByLabel('Toggle filters').click();
    const trigger = page.getByLabel('Technician');
    await expect(trigger).toContainText('Tech 1');

    await trigger.click();
    await page.getByRole('option', { name: 'Tech 2' }).click();
    await expect(page).toHaveURL(/tech=\d+/);
    await expect(trigger).toContainText('Tech 2');

    await page.goBack();
    // URL + data revert AND the select follows (no stale Tech 2 display).
    await expect(page).toHaveURL(/\/route(\?|$)/);
    await expect(trigger).toContainText('Tech 1');
  });

  test('date navigation Back resyncs the select too', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/route');
    await page.getByLabel('Toggle filters').click();
    const trigger = page.getByLabel('Technician');
    await expect(trigger).toContainText('Tech 1');

    await trigger.click();
    await page.getByRole('option', { name: 'Tech 2' }).click();
    await expect(page).toHaveURL(/tech=\d+/);
    const tech2 = (/tech=(\d+)/.exec(page.url()) as RegExpExecArray)[1];
    await page.goto(`/route?tech=${tech2}&date=2030-01-05`);
    await expect(page).toHaveURL(/date=2030-01-05/);

    await page.goBack();
    await expect(page).toHaveURL(/tech=\d+/);
    // page.goto() is a full document load, so the filter panel state resets;
    // reopen it — the resync assertion below still validates data→UI sync.
    if ((await trigger.count()) === 0) await page.getByLabel('Toggle filters').click();
    await expect(trigger).toContainText('Tech 2');
  });

  test('rapid double-pick ends consistent (no stale revert)', async ({ page }) => {
    await login(page, 'ekas');
    await page.goto('/route');
    await page.getByLabel('Toggle filters').click();
    const trigger = page.getByLabel('Technician');
    const toggle = page.getByLabel('Toggle filters');
    await expect(trigger).toContainText('Tech 1');

    // Two picks with no waiting between. A stale load must not leave the
    // select (bits-ui value) disagreeing with the derived heading (selTech):
    // both read the same settled state.
    await trigger.click();
    await page.getByRole('option', { name: 'Tech 2' }).click();
    await trigger.click();
    await page.getByRole('option', { name: 'Tech 1' }).click();
    await expect(trigger).toContainText('Tech 1');
    await expect(toggle).toContainText('Tech 1');
  });
});
