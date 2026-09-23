import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('.impeccable/review', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    await page.goto('http://127.0.0.1:3102');
    await page.screenshot({ path: `.impeccable/review/${name}-paste.png`, fullPage: true });
    await page.getByRole('button', { name: 'Try a sample passage' }).click();
    await page.getByRole('button', { name: 'Prepare reading' }).click();
    await page.getByRole('button', { name: 'Start reading', exact: true }).click();
    await page.waitForTimeout(700); await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.impeccable/review/${name}.png`, fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
