import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const origin = 'http://127.0.0.1:3103';
await mkdir('.impeccable/review', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  let scoreRequests = 0;
  page.on('request', r => { if (r.url().endsWith('/api/score')) scoreRequests++; });
  await page.goto(origin);
  await page.getByRole('button', { name: 'Try a sample passage' }).click();
  await page.getByRole('button', { name: 'Prepare reading' }).click();
  await page.getByRole('button', { name: 'Start reading', exact: true }).click();
  await page.locator('.sentence[data-status="scored"]').first().waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('.sentence[data-status="pending"]'), undefined, { timeout: 30000 });
  await page.waitForTimeout(350);
  const before = scoreRequests;
  const slider = page.getByRole('slider', { name: 'Raw prefix-mean cutoff' });
  await slider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('End');
  await page.waitForTimeout(250);
  if (scoreRequests !== before) throw new Error('Moving the cutoff triggered an API scoring request');
  await page.locator('.sentence[data-status="scored"]').first().focus();
  await page.screenshot({ path: '.impeccable/review/prefix-live-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.screenshot({ path: '.impeccable/review/prefix-live-mobile-settings.png', fullPage: true });
  console.log(JSON.stringify({ liveProviderUiChecked: true, sliderAdditionalRequests: 0, scoreRequests, mode: await page.locator('#mode').textContent() }));
  await page.close();
} finally { await browser.close(); }
