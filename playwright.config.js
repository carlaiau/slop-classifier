import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3102', browserName: 'chromium', launchOptions: { channel: 'chrome' } },
  webServer: { command: 'node src/server.js', url: 'http://127.0.0.1:3102', reuseExistingServer: !process.env.CI },
  reporter: 'list'
});
