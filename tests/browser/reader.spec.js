import { test, expect } from '@playwright/test';

async function readSample(page) {
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample passage' }).click();
  await page.getByRole('button', { name: 'Prepare reading' }).click();
  await page.getByRole('button', { name: 'Start reading', exact: true }).click();
  await expect(page.locator('.sentence[data-status=scored]').first()).toBeVisible();
}
test('paste stays exact; viewport scheduling, dial reuse, keyboard map and clear work', async ({ page }) => {
  let count = 0; page.on('request', r => { if (r.url().endsWith('/api/score')) count++; });
  await readSample(page); const exact = await page.locator('#text').textContent();
  expect(exact).toContain('Mara arrived with a lamp');
  await page.waitForTimeout(600); const before = count;
  await page.locator('#threshold').focus(); await page.keyboard.press('Home'); await page.waitForTimeout(150);
  expect(count).toBe(before);
  expect(await page.locator('.sentence[data-status=unscored]').count()).toBeGreaterThan(0);
  await page.locator('.sentence').first().focus(); await expect(page.locator('#detail-text')).toContainText('Sentence 1');
  await page.locator('#map button').first().focus(); await page.keyboard.press('End');
  await expect(page.locator('#map button').last()).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.locator('.sentence').last()).toBeFocused();
  await page.getByRole('button', { name: 'New text' }).click();
  await expect(page.locator('#paste')).toHaveValue(''); await expect(page.locator('#text')).toBeEmpty();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
test('rapid scrolling never exceeds bounded client requests and stale responses cannot replace new text', async ({ page }) => {
  let active = 0, max = 0;
  await page.route('**/api/score', async route => { active++; max = Math.max(max, active); await new Promise(r => setTimeout(r, 150)); await route.continue(); active--; });
  await readSample(page);
  for (let i = 0; i < 5; i++) await page.evaluate(i => window.scrollTo(0, i * 400), i);
  await page.getByRole('button', { name: 'New text' }).click();
  await page.waitForTimeout(400); await expect(page.locator('#text')).toBeEmpty(); expect(max).toBeLessThanOrEqual(3);
});
test.describe('touch reader', () => {
test.use({ hasTouch: true });
test('mobile drawers, focus return, visible statuses and no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await readSample(page);
  await page.locator('.sentence').first().tap(); await expect(page.locator('#mobile-detail')).toBeVisible();
  await expect(page.locator('#mobile-detail-text')).toContainText('Sentence 1');
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.locator('#threshold')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Text map', exact: true }).click(); await expect(page.locator('#map')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Text map' })).toBeVisible();
  expect(await page.locator('#map button').first().evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(24);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
});
test('failure is explicit and retry affects only nearby failures', async ({ page }) => {
  let fail = true;
  await page.route('**/api/score', route => fail ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Controlled test failure' }) }) : route.continue());
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample passage' }).click(); await page.getByRole('button', { name: 'Prepare reading' }).click(); await page.getByRole('button', { name: 'Start reading', exact: true }).click();
  await expect(page.locator('#analysis-error')).toContainText('Controlled test failure');
  fail = false; await page.getByRole('button', { name: 'Retry visible sentences' }).click(); await expect(page.locator('.sentence[data-status=scored]').first()).toBeVisible();
});
