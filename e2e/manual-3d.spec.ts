import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  if (await page.locator('#username').isVisible()) {
    await page.fill('#username', 'testuser')
    await page.fill('#password', 'testuser123')
    await page.click('button[type="submit"]')
    await expect(page.getByTestId('report-panel')).toBeVisible()
    await page.evaluate(async () => {
      const token = window.localStorage.getItem('cargo_token')
      if (!token) return
      await fetch('/api/history', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    })
  }
})

async function ensureChinese(page: Page) {
  const zhButton = page.getByRole('button', { name: '中文' })
  if (await zhButton.count()) {
    await zhButton.click()
  }
}

async function enterManualMode(page: Page) {
  await page.getByTestId('placement-mode-manual').click()
  await expect(page.getByTestId('manual-workspace')).toBeVisible()
}

test('默认装载规则为数量优先', async ({ page }) => {
  await ensureChinese(page)
  const select = page.getByLabel('装载规则')
  await expect(select).toHaveValue('quantity')
  const selectedText = await select.locator('option:checked').textContent()
  expect(selectedText?.trim()).toBe('数量优先')
})

test('容器尺寸 badge 与场景同步且不遮挡手动工具栏', async ({ page }) => {
  await ensureChinese(page)
  const badge = page.getByTestId('container-dimension-badge')
  await expect(badge).toBeVisible()
  await expect(badge).toContainText('mm')

  await page.getByLabel('货柜类型').selectOption({ index: 1 })
  await page.waitForTimeout(50)
  const afterSwitchText = await badge.textContent()
  expect(afterSwitchText?.length).toBeGreaterThan(0)

  await enterManualMode(page)
  const badgeBox = await badge.boundingBox()
  const undoButton = page.getByTestId('manual-undo')
  await expect(undoButton).toBeVisible()
  const undoBox = await undoButton.boundingBox()
  expect(badgeBox).not.toBeNull()
  expect(undoBox).not.toBeNull()
  if (badgeBox && undoBox) {
    const overlaps =
      badgeBox.x < undoBox.x + undoBox.width &&
      badgeBox.x + badgeBox.width > undoBox.x &&
      badgeBox.y < undoBox.y + undoBox.height &&
      badgeBox.y + badgeBox.height > undoBox.y
    expect(overlaps).toBe(false)
  }
})

test('手动模式 2D 视角切换前/侧视图，SVG viewBox 随之变化', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  await page.getByRole('button', { name: '2D', exact: true }).click()

  const svg = page.getByTestId('manual-placement-2d')
  await expect(svg).toHaveAttribute('data-view-mode', 'top')
  const topViewBox = await svg.getAttribute('viewBox')

  await page.getByRole('button', { name: '正视', exact: true }).click()
  await expect(svg).toHaveAttribute('data-view-mode', 'front')
  const frontViewBox = await svg.getAttribute('viewBox')
  expect(frontViewBox).not.toBe(topViewBox)

  await page.getByRole('button', { name: '侧视', exact: true }).click()
  await expect(svg).toHaveAttribute('data-view-mode', 'side')
  const sideViewBox = await svg.getAttribute('viewBox')
  expect(sideViewBox).not.toBe(frontViewBox)
})

test('手动模式 3D 暴露 manualEditable canvas，pool 项目可拖拽', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  await expect(page.getByTestId('container-scene')).toBeVisible()

  const poolItems = page.getByTestId('manual-pool-item')
  const count = await poolItems.count()
  expect(count).toBeGreaterThan(0)
  await expect(poolItems.first()).toHaveAttribute('draggable', 'true')
})
