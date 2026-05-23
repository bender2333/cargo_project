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
  const scene = page.getByTestId('container-scene')
  await expect(scene).toBeVisible()
  await expect(scene).toHaveAttribute('data-interaction-mode', 'manual')
  await expect(scene).toHaveAttribute('data-controls-enabled', 'true')

  const poolItems = page.getByTestId('manual-pool-item')
  const count = await poolItems.count()
  expect(count).toBeGreaterThan(0)
  await expect(poolItems.first()).toHaveAttribute('draggable', 'true')
})

test('自动模式默认锁定视角；点自由视角后切到 free 状态', async ({ page }) => {
  await ensureChinese(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toBeVisible()
  await expect(scene).toHaveAttribute('data-interaction-mode', 'locked')
  await page.getByRole('button', { name: '自由视角' }).click()
  await expect(scene).toHaveAttribute('data-interaction-mode', 'free')
})

test('从历史方案恢复自定义柜型后 3D 场景重建并显示新箱体', async ({ page }) => {
  await ensureChinese(page)

  await page.getByLabel('货柜类型').selectOption('custom')
  await page.getByLabel('长 mm').first().fill('14000')
  await page.getByLabel('宽 mm').first().fill('2350')
  await page.getByLabel('高 mm').first().fill('2600')
  await page.getByLabel('最大载重 kg').fill('30000')

  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('名称', { exact: true }).fill('恢复探针')
  await cargoForm.getByLabel('标识', { exact: true }).fill('P')
  await cargoForm.getByLabel('长 mm').fill('1200')
  await cargoForm.getByLabel('宽 mm').fill('800')
  await cargoForm.getByLabel('高 mm').fill('900')
  await cargoForm.getByLabel('重量 kg').fill('100')
  await cargoForm.getByLabel('数量', { exact: true }).fill('5')
  await page.getByRole('button', { name: '+ 添加货物' }).click()

  await page.getByRole('button', { name: '装箱', exact: true }).click()
  await page.getByRole('button', { name: '历史方案', exact: true }).click()
  await page.getByRole('button', { name: '保存方案' }).click()
  await page.waitForTimeout(300)

  await page.getByRole('button', { name: '工作台', exact: true }).click()
  await page.getByRole('button', { name: '新建项目' }).click()
  await page.waitForTimeout(150)

  await page.getByRole('button', { name: '历史方案', exact: true }).click()
  await page.getByRole('button', { name: '恢复' }).first().click()
  await page.waitForTimeout(400)

  await expect(page.getByText('14,000 × 2,350 × 2,600 mm')).toBeVisible({ timeout: 5000 })

  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  await page.waitForTimeout(400)

  const colors = await canvas.evaluate((node) => {
    const el = node as HTMLCanvasElement
    const gl = el.getContext('webgl2') ?? el.getContext('webgl')
    if (!gl) return 0
    const set = new Set<string>()
    const pixel = new Uint8Array(4)
    for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      for (const y of [0.2, 0.35, 0.5, 0.65, 0.8]) {
        gl.readPixels(Math.floor(el.width * x), Math.floor(el.height * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        set.add(`${pixel[0]>>3}:${pixel[1]>>3}:${pixel[2]>>3}`)
      }
    }
    return set.size
  })
  expect(colors).toBeGreaterThanOrEqual(4)
})

test('?debug=1 显示调试面板并展示当前状态', async ({ page }) => {
  await page.goto('/?debug=1')
  await expect(page.getByTestId('debug-panel')).toBeVisible()
  await expect(page.getByTestId('debug-panel')).toContainText('testuser')
  await expect(page.getByTestId('debug-panel')).toContainText('Container')
})

test('调试面板 admin 可拉取服务器日志', async ({ page }) => {
  await page.evaluate(async () => {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    }).then((r) => r.json()).then((data) => {
      window.localStorage.setItem('cargo_token', data.token)
    })
  })
  await page.goto('/?debug=1')
  await expect(page.getByTestId('debug-panel')).toBeVisible()
  const fetchBtn = page.getByTestId('debug-fetch-logs')
  await expect(fetchBtn).toBeVisible()
  await fetchBtn.click()
  await page.waitForTimeout(500)
})
