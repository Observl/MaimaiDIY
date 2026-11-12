import { defineConfig } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT || '4174';
const baseURL = 'http://127.0.0.1:' + port;

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 120000,
  expect: { timeout: 30000 },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tools/serve.mjs dist',
    url: baseURL,
    env: { PORT: port },
    reuseExistingServer: false,
  },
});
