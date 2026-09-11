import { defineConfig, devices } from '@playwright/test'
import base from './playwright.config'
import { e2eCredentials } from './e2e/credentials'

if (!process.env.PLAYWRIGHT_BASE_URL) {
  throw new Error('[e2e] PLAYWRIGHT_BASE_URL is required for deployment regression')
}
// Validate the test user before opening a browser; deployment tests need no administrator.
void e2eCredentials.user

export default defineConfig(base, {
  grep: /@deployment/,
  outputDir: 'test-results/remote',
  forbidOnly: true,
  workers: 1,
  retries: 0,
  webServer: undefined,
  use: { trace: 'off' },
  projects: [{
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
  }],
})
