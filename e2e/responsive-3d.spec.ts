import { expect, test } from '@playwright/test'

/**
 * 9th-review phase 2 regression: verify that the 3D workspace canvas scales
 * horizontally as the viewport widens. Prior to this change the parent
 * container was capped at max-w-[1500px], leaving large gutters on wide
 * monitors. After the fix, the canvas clientWidth must strictly grow when
 * the viewport widens through 1366 -> 1920 -> 2560.
 *
 * The default Playwright config starts both the Express API on port 3010 with
 * an in-memory SQLite database and the Vite server that proxies /api to it.
 */

const adminUsername = 'admin'
const adminPassword = 'admin123'

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.fill('#username', adminUsername)
  await page.fill('#password', adminPassword)
  await page.click('button[type="submit"]')
  await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible({ timeout: 15_000 })
}

async function measure3dCanvasWidth(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
): Promise<number> {
  await page.setViewportSize({ width, height })
  // Allow layout reflow after viewport change.
  await page.waitForTimeout(500)
  const canvas = page.locator('[data-testid="visual-workspace"] canvas').first()
  await expect(canvas).toBeVisible({ timeout: 10_000 })
  const clientWidth = await canvas.evaluate((el) => (el as HTMLCanvasElement).clientWidth)
  return clientWidth
}

test.describe('Responsive 3D workspace scaling', () => {
  test('3D canvas width grows monotonically with viewport width', async ({ page }) => {
    await loginAsAdmin(page)

    // Ensure we're on the workbench and a default plan is rendered.
    await expect(page.getByTestId('visual-workspace')).toBeVisible({ timeout: 10_000 })

    // Capture widths at three monitor sizes.
    const width1366 = await measure3dCanvasWidth(page, 1366, 768)
    const width1920 = await measure3dCanvasWidth(page, 1920, 1080)
    const width2560 = await measure3dCanvasWidth(page, 2560, 1440)

    // Log readings for easier debugging on CI.
    test.info().annotations.push({
      type: 'measurements',
      description: `1366=${width1366}px, 1920=${width1920}px, 2560=${width2560}px`,
    })

    // Strict monotonic growth: each wider viewport must yield a wider canvas.
    expect(width1920).toBeGreaterThan(width1366)
    expect(width2560).toBeGreaterThan(width1920)
  })
})
