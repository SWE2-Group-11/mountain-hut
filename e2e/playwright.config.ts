import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalTeardown: './global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Mailpit catches the emails sent by the backend (SMTP 1025, API on 8025). An instance
      // already running (e.g. started with the README command) is reused: the tests never clear its inbox.
      // The container started here is removed by global-teardown.ts.
      command: 'docker run --rm --name e2e-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit:v1.27.0',
      url: 'http://localhost:8025/readyz',
      reuseExistingServer: true,
    },
    {
      // Backend on a fresh in-memory database, reset and seeded at start (seed-core.sql).
      // Never reused: a backend already running on port 3000 would be using the real
      // database file (backend/src/data/database.sqlite), so the run stops instead.
      command: 'npx tsx src/index.ts',
      cwd: '../backend',
      env: { RESET_DB: 'true', DB_PATH: ':memory:', PORT: '3000', SMTP_HOST: 'localhost', SMTP_PORT: '1025' },
      port: 3000,
      reuseExistingServer: false,
    },
    {
      // Frontend dev server; Vite proxies /api to the backend on port 3000
      command: 'npm run dev -- --port 5173 --strictPort',
      cwd: '../frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
