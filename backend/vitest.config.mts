import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    env: { DB_PATH: ':memory:' },
    setupFiles: ['./src/tests/setup.ts'],
  },
})