import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { defineConfig } from 'vitest/config'

// Test-only session secret and seed accounts: tests never read the real .env
const testEnv = parseEnv(readFileSync(new URL('./src/tests/fixtures/test.env', import.meta.url), 'utf-8')) as Record<string, string>

export default defineConfig({
  test: {
    pool: 'forks',
    env: { ...testEnv, DB_PATH: ':memory:' },
    setupFiles: ['./src/tests/setup.ts'],
    passWithNoTests: true,
  },
})