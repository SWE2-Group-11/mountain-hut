import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
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
      // Backend on a fresh in-memory database, reset and seeded at start (seed-core.sql).
      // Never reused: a backend already running on port 3000 would be using the real
      // database file (backend/src/data/database.sqlite), so the run stops instead.
      command: 'npx tsx src/index.ts',
      cwd: '../backend',
      env: { RESET_DB: 'true', DB_PATH: ':memory:', PORT: '3000' },
      url: 'http://localhost:3000/api/v1/services',
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
