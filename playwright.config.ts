import { defineConfig, devices } from '@playwright/test';

const production = process.env.E2E_PRODUCTION === '1';
const baseURL = production ? 'http://127.0.0.1:8086' : 'http://127.0.0.1:5186';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 375, height: 812 },
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'iphone-webkit',
      use: {
        ...devices['iPhone 13'],
        viewport: { width: 375, height: 812 },
        browserName: 'webkit',
      },
    },
  ],
  webServer: {
    command: production ? 'npm start' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
