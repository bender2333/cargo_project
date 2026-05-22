import { defineConfig, devices } from '@playwright/test'

const localPort = process.env.PLAYWRIGHT_PORT ?? '5176'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${localPort}`
const useExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL)
const workers = process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 1

export default defineConfig({
  testDir: './e2e',
  workers,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: useExternalServer ? undefined : {
    command: `npm run dev -- --host 127.0.0.1 --port ${localPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
