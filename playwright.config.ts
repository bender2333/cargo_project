import { defineConfig, devices } from '@playwright/test'

const localPort = process.env.PLAYWRIGHT_PORT ?? '5176'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${localPort}`
const useExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL)
const workers = process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 1
const localApiURL = 'http://127.0.0.1:3010'

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/current',
  workers,
  reporter: [['list'], ['./scripts/no-skipped-e2e-reporter.mjs']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: useExternalServer ? undefined : [
    {
      command: 'node server/index.mjs',
      url: `${localApiURL}/api/import-templates`,
      env: {
        PORT: '3010',
        CARGO_DB_PATH: ':memory:',
        CARGO_LOG_PATH: 'test-data/e2e/server-log.txt',
        NODE_ENV: 'test',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${localPort} --strictPort`,
      url: baseURL,
      env: { VITE_API_TARGET: localApiURL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
