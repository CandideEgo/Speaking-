import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 30000,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-iphone',
      use: { ...devices['iPhone X'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],

  webServer: process.env.CI
    ? undefined
    : [
        {
          command: 'cd ../backend && uvicorn app.main:app --port 8000',
          port: 8000,
          reuseExistingServer: !process.env.CI,
          timeout: 10000,
        },
        {
          command: 'npm run dev',
          port: 3000,
          reuseExistingServer: !process.env.CI,
          timeout: 30000,
        },
      ],
});
