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

async function placeSingleManualBoxForRotation(page: Page) {
  await enterManualMode(page)
  await page.getByRole('button', { name: '2D', exact: true }).click()
  const poolItem = page.getByTestId('manual-pool-item').first()
  await expect(poolItem).toHaveAttribute('draggable', 'true')
  await page.evaluate(() => {
    const pool = document.querySelector<HTMLElement>('[data-testid="manual-pool-item"]')
    const svg = document.querySelector<SVGSVGElement>('[data-testid="manual-placement-2d"]')
    if (!pool || !svg) throw new Error('manual pool item or placement SVG missing')

    const dataTransfer = new DataTransfer()
    pool.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }))
    const size = JSON.parse(dataTransfer.getData('application/x-cargo-size') || 'null') as { length?: number; width?: number } | null
    const viewBox = svg.viewBox.baseVal
    const ctm = svg.getScreenCTM()
    if (!size?.length || !size.width || !ctm) throw new Error('manual drag payload or SVG matrix missing')

    const padding = 28
    const horizontalSpan = viewBox.width - padding * 2
    const verticalSpan = viewBox.height - padding * 2
    const topLeftX = Math.min(100, Math.max(0, horizontalSpan - size.length))
    const topLeftY = Math.min(100, Math.max(0, verticalSpan - size.width))
    const centerX = topLeftX + size.length / 2
    const centerY = topLeftY + size.width / 2
    const clientPoint = new DOMPoint(padding + centerX, padding + verticalSpan - centerY).matrixTransform(ctm)

    for (const type of ['dragenter', 'dragover', 'drop']) {
      svg.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: clientPoint.x,
        clientY: clientPoint.y,
        dataTransfer,
      }))
    }
    pool.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }))
  })
  const box = page.locator('[data-box-id]').first()
  await expect(box).toBeVisible()
  const boxId = await box.getAttribute('data-box-id')
  expect(boxId).toBeTruthy()
  await page.getByRole('button', { name: '3D', exact: true }).click()
  const scene = page.getByTestId('container-scene')
  await expect(scene).not.toHaveAttribute('data-selected-orientation', '')
  const before = await scene.getAttribute('data-selected-orientation')
  return { boxId, before }
}

test('默认装载规则为数量优先', async ({ page }) => {
  await ensureChinese(page)
  const select = page.getByLabel('装载规则')
  await expect(select).toHaveValue('quantity')
  const selectedText = await select.locator('option:checked').textContent()
  expect(selectedText?.trim()).toBe('数量优先')
})

test('允许堆叠时显示最大堆叠层数输入，取消后隐藏', async ({ page }) => {
  await ensureChinese(page)
  await expect(page.getByTestId('max-stack-layers-field')).toBeVisible()
  await page.getByTestId('max-stack-layers-field').getByRole('spinbutton').fill('4')
  await page.getByLabel('允许堆叠').first().uncheck()
  await expect(page.getByTestId('max-stack-layers-field')).toHaveCount(0)
  await page.getByLabel('允许堆叠').first().check()
  await expect(page.getByTestId('max-stack-layers-field')).toBeVisible()
})

test('导出视图不再显示容器尺寸徽标且手动画布按钮可见', async ({ page }) => {
  await ensureChinese(page)
  await expect(page.getByTestId('container-dimension-badge')).toHaveCount(0)

  await enterManualMode(page)
  const helpButton = page.getByTestId('manual-keyboard-help')
  await expect(helpButton).toBeVisible()
  await expect(page.getByTestId('maximize-workspace')).toBeVisible()
  await expect(page.getByTestId('container-dimension-badge')).toHaveCount(0)
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

test('手动模式一键放置从 pool 添加货物并减少剩余数量', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-box-count', '0')
  const firstPoolItem = page.getByTestId('manual-pool-item').first()
  const cargoId = await firstPoolItem.getAttribute('data-cargo-id')
  expect(cargoId).toBeTruthy()
  const beforeRemaining = Number(await firstPoolItem.getAttribute('data-remaining'))
  expect(beforeRemaining).toBeGreaterThan(0)

  await page.getByTestId(`pool-quick-place-${cargoId}`).click()

  await expect(scene).toHaveAttribute('data-box-count', '1')
  await expect(firstPoolItem).toHaveAttribute('data-remaining', String(beforeRemaining - 1))
  await expect(scene).not.toHaveAttribute('data-selected-orientation', '')
})

test('手动模式默认即可旋转视角与拖箱，显示旋转提示', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-interaction-mode', 'manual')
  await expect(scene).toHaveAttribute('data-controls-enabled', 'true')
  await page.getByTestId('manual-keyboard-help').click()
  await expect(page.getByTestId('manual-keyboard-help-popover')).toContainText('中键')
})

test('手动模式键盘帮助展示 Z 轴与快捷键说明', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  await page.getByTestId('manual-keyboard-help').click()
  const popover = page.getByTestId('manual-keyboard-help-popover')
  await expect(popover).toContainText('Shift + 拖拽')
  await expect(popover).toContainText('PageUp/PageDown')
  await expect(popover).toContainText('Ctrl/Cmd = 1 mm')
  await expect(popover).toContainText('Shift + R')
  await expect(popover).toContainText('Delete')
  await expect(popover).toContainText('Esc')
})

test('手动模式阻止键盘把箱体移动到悬空位置', async ({ page }) => {
  await ensureChinese(page)
  await page.getByRole('button', { name: '继续手动微调' }).click()
  await expect(page.getByTestId('manual-workspace')).toBeVisible()
  await expect(page.getByTestId('container-scene')).toHaveAttribute('data-box-count', '18')

  await page.getByRole('button', { name: '2D', exact: true }).click()
  const firstManualBox = page.locator('[data-box-id]').first()
  await firstManualBox.dispatchEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(page.getByTestId('container-scene')).toHaveAttribute('data-selected-orientation', 'LWH')

  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-box-count', '18')
  await page.keyboard.press('PageUp')
  await expect(page.getByTestId('manual-operation-notice')).toBeVisible()
  await expect(page.getByTestId('manual-issues')).toHaveCount(0)
  await expect(scene).toHaveAttribute('data-box-count', '18')
})

test('手动模式 R 与 Shift+R 更新 3D 场景根朝向状态', async ({ page }) => {
  await ensureChinese(page)
  const selected = await placeSingleManualBoxForRotation(page)
  const scene = page.getByTestId('container-scene')
  await page.keyboard.press('R')
  await expect(scene).not.toHaveAttribute('data-selected-orientation', selected.before ?? '')
  const after = await scene.getAttribute('data-selected-orientation')
  expect(after).toBeTruthy()
  await expect(scene).not.toHaveAttribute('data-selected-axes', '')
  await page.keyboard.press('Shift+R')
  await expect(scene).not.toHaveAttribute('data-selected-orientation', after ?? '')
  const afterShift = await scene.getAttribute('data-selected-orientation')
  expect(afterShift).toBeTruthy()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(page.locator(`[data-box-id="${selected.boxId}"]`).getByTestId('manual-orientation-marker')).toHaveAttribute('data-orientation', afterShift ?? '')
})

test('手动模式 3D 双击选中箱体切换场景内弧形手柄', async ({ page }) => {
  await ensureChinese(page)
  await page.getByRole('button', { name: '继续手动微调' }).click()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await page.locator('[data-box-id]').first().dispatchEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
  await page.getByRole('button', { name: '3D', exact: true }).click()

  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-gizmo-visible', 'false')
  await expect(scene).toHaveAttribute('data-gizmo-handle-count', '4')
  const before = await scene.getAttribute('data-selected-orientation')
  expect(before).not.toBeNull()

  const box = await scene.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  await scene.dblclick({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(scene).toHaveAttribute('data-gizmo-visible', 'true')
  await scene.dblclick({ position: { x: box.width / 2, y: box.height / 2 } })
  await expect(scene).toHaveAttribute('data-gizmo-visible', 'false')
  await page.keyboard.press('Escape')
  await expect(scene).toHaveAttribute('data-selected-orientation', '')
})

test('尺规在 2D 中创建固定测量线并可删除', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await page.getByTestId('toggle-ruler').click()
  const capture = page.getByTestId('measurement-capture')
  const box = await capture.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  await capture.click({ force: true, position: { x: 120, y: 120 } })
  await expect(page.getByTestId('measurement-draft-point')).toBeVisible()
  await capture.click({ force: true, position: { x: 260, y: 170 } })
  await expect(page.getByTestId('measurement-line')).toHaveCount(1)
  await expect(page.getByTestId('measurement-list-item')).toHaveCount(1)
  await page.getByTestId('measurement-list-item').getByRole('button', { name: '删除' }).click()
  await expect(page.getByTestId('measurement-line')).toHaveCount(0)
})

test('尺规在 3D 中创建固定测量线并可删除', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-ruler-enabled', 'false')
  await page.getByTestId('toggle-ruler').click()
  await expect(scene).toHaveAttribute('data-ruler-enabled', 'true')
  const canvas = page.locator('canvas').first()
  await canvas.click({ position: { x: 160, y: 180 } })
  await expect(scene).toHaveAttribute('data-measurement-hit-count', '1')
  await expect(scene).toHaveAttribute('data-measurement-draft', 'true')
  await canvas.click({ position: { x: 240, y: 220 } })
  await expect(scene).toHaveAttribute('data-measurement-hit-count', '2')
  await expect(scene).toHaveAttribute('data-measurement-count', '1')
  await expect(page.getByTestId('measurement-list-item')).toHaveCount(1)

  await page.getByTestId('measurement-list-item').getByRole('button', { name: '删除' }).click()
  await expect(scene).toHaveAttribute('data-measurement-count', '0')
})

test('自动模式默认即可旋转，重置视角按钮可用', async ({ page }) => {
  await ensureChinese(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toBeVisible()
  await expect(scene).toHaveAttribute('data-interaction-mode', 'auto')
  await expect(scene).toHaveAttribute('data-controls-enabled', 'true')
  await page.getByTestId('reset-view').click()
  await expect(scene).toHaveAttribute('data-interaction-mode', 'auto')
})

test('自动模式更换货柜后清空旧画布并提示重新计算', async ({ page }) => {
  await ensureChinese(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toBeVisible()
  await page.getByLabel('货柜类型').selectOption({ index: 1 })
  await expect(page.getByTestId('container-change-notice')).toContainText('重新计算')
  await expect(scene).toHaveAttribute('data-box-count', '0')
  await expect(scene).toHaveAttribute('data-interaction-mode', 'auto')
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

  await expect(page.getByLabel('长 mm').first()).toHaveValue('14000')
  await expect(page.getByLabel('宽 mm').first()).toHaveValue('2350')
  await expect(page.getByLabel('高 mm').first()).toHaveValue('2600')
  await expect(page.getByTestId('container-dimension-badge')).toHaveCount(0)

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

test('调试面板可下载手动排布复现场景快照', async ({ page }) => {
  await ensureChinese(page)
  await page.goto('/?debug=1')
  await enterManualMode(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('debug-download-snapshot').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('cargo-debug-snapshot.json')

  const snapshot = await page.evaluate(() => {
    const debugWindow = window as unknown as { __cargoSnapshot?: () => unknown }
    return debugWindow.__cargoSnapshot?.()
  })
  expect(snapshot).toMatchObject({
    schemaVersion: 1,
    recovery: { testHelper: 'restoreManualDebugScenario' },
    mode: { placement: 'manual' },
  })
  const manualBoxes = (snapshot as { manual?: { draft?: { boxes?: unknown[] } } })?.manual?.draft?.boxes ?? []
  expect(Array.isArray(manualBoxes)).toBe(true)
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

test('网格吸附按钮切换 data-grid-snap', async ({ page }) => {
  await ensureChinese(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-grid-snap', 'on')
  await page.getByLabel('工作台菜单').click()
  await page.getByTestId('snap-settings-toggle').click()
  await expect(page.getByTestId('visual-workspace').getByTestId('toggle-grid-snap')).toHaveCount(0)
  await page.getByTestId('toggle-grid-snap').click()
  await expect(scene).toHaveAttribute('data-grid-snap', 'off')
  await page.getByTestId('toggle-grid-snap').click()
  await expect(scene).toHaveAttribute('data-grid-snap', 'on')
})

test('作业回放面板按 workSteps 顺序逐步显示箱体', async ({ page }) => {
  await ensureChinese(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toBeVisible()
  const totalBoxes = await scene.getAttribute('data-box-count')
  expect(Number(totalBoxes)).toBeGreaterThan(2)

  // open playback tab
  await page.getByRole('button', { name: '作业回放' }).click()
  await expect(page.getByTestId('playback-panel')).toBeVisible()

  // step from 0 to 2 and ensure data-box-count reflects cursor
  await expect(scene).toHaveAttribute('data-box-count', '0')
  await page.getByTestId('playback-next').click()
  await expect(scene).toHaveAttribute('data-box-count', '1')
  await page.getByTestId('playback-next').click()
  await expect(scene).toHaveAttribute('data-box-count', '2')
  await page.getByTestId('playback-prev').click()
  await expect(scene).toHaveAttribute('data-box-count', '1')
  await page.getByTestId('playback-finish').click()
  await expect(scene).toHaveAttribute('data-box-count', String(totalBoxes))
})

test('装柜步骤按阶段合并显示并高亮当前阶段', async ({ page }) => {
  await ensureChinese(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toBeVisible()
  const totalBoxes = Number(await scene.getAttribute('data-box-count'))
  expect(totalBoxes).toBeGreaterThan(2)

  await page.getByRole('button', { name: '装柜步骤' }).click()
  const panel = page.getByTestId('loading-steps-panel')
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('loading-steps-current')).toContainText('阶段 1')
  await expect(page.getByTestId('loading-steps-labels')).toContainText('A')

  const firstGroupCount = Number(await panel.getAttribute('data-active-box-count'))
  expect(firstGroupCount).toBeGreaterThan(1)
  expect(firstGroupCount).toBeLessThan(totalBoxes)

  await page.getByTestId('loading-steps-next').click()
  await expect(panel).toHaveAttribute('data-active-group', '2')
  await expect(page.getByTestId('loading-steps-current')).toContainText('步骤')
})

test('手动模式作业回放面板提示不可用', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  await page.getByRole('button', { name: '作业回放' }).click()
  await expect(page.getByTestId('playback-panel-empty')).toContainText('自动排布完成后')
})

test('装载重心面板显示三轴偏移与状态', async ({ page }) => {
  await ensureChinese(page)
  await page.getByRole('button', { name: '装载重心' }).click()
  const panel = page.getByTestId('cog-panel')
  await expect(panel).toBeVisible()
  // status should be one of warning / balanced / cautious
  const status = await panel.getAttribute('data-cog-status')
  expect(['warning', 'balanced', 'cautious']).toContain(status)
  // axis rows present
  await expect(panel.locator('[data-axis="length"]')).toBeVisible()
  await expect(panel.locator('[data-axis="width"]')).toBeVisible()
  await expect(panel.locator('[data-axis="height"]')).toBeVisible()
})

test('柜型对比面板列出选中柜型的装载率', async ({ page }) => {
  await ensureChinese(page)
  await page.getByRole('button', { name: '柜型对比' }).click()
  await expect(page.getByTestId('container-compare-panel')).toBeVisible()
  // at least 1 row by default
  const rows = page.locator('[data-testid^="container-compare-row-"]')
  await expect(rows.first()).toBeVisible()
  // recommended badge exists on exactly one row
  const recommended = page.locator('[data-recommended="true"]')
  await expect(recommended).toHaveCount(1)
  // Apply best fit changes selected container
  const recommendedId = await recommended.getAttribute('data-testid')
  expect(recommendedId).toMatch(/^container-compare-row-/)
  await page.getByTestId('container-compare-apply').click()
  // After apply, scene re-renders for new container
  await expect(page.getByTestId('container-scene')).toBeVisible()
})

test('补装建议面板列出标准箱型与剩余容量', async ({ page }) => {
  await ensureChinese(page)
  await page.getByRole('button', { name: '补装建议' }).click()
  const panel = page.getByTestId('fill-panel')
  await expect(panel).toBeVisible()
  // at least one row visible
  const rows = page.locator('[data-testid^="fill-row-"]')
  await expect(rows.first()).toBeVisible()
  // Either at least one preset has maxCount > 0, or the "none fits" notice is shown.
  const positive = page.locator('[data-testid^="fill-row-"][data-max-count]:not([data-max-count="0"])').first()
  const none = page.getByTestId('fill-none')
  await expect(positive.or(none)).toBeVisible()
})

test('Balance 3D 切换在主场景显示重心 overlay', async ({ page }) => {
  await ensureChinese(page)
  await page.getByRole('button', { name: '装载重心' }).click()
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-cog-overlay', 'off')
  await page.getByTestId('cog-toggle-3d').click()
  await expect(scene).toHaveAttribute('data-cog-overlay', 'on')
  await page.getByTestId('cog-toggle-3d').click()
  await expect(scene).toHaveAttribute('data-cog-overlay', 'off')
})

test('装载重心 overlay 离开页签即停止且重心场已下线', async ({ page }) => {
  await ensureChinese(page)
  await page.getByRole('button', { name: '装载重心' }).click()
  const scene = page.getByTestId('container-scene')
  await expect(page.getByTestId('cog-toggle-gravity-field')).toHaveCount(0)
  await expect(scene).toHaveAttribute('data-gravity-field', 'off')
  await page.getByTestId('cog-toggle-3d').click()
  await expect(scene).toHaveAttribute('data-cog-overlay', 'on')
  await page.getByRole('button', { name: '分层查看' }).click()
  await expect(scene).toHaveAttribute('data-cog-overlay', 'off')
  await expect(scene).toHaveAttribute('data-gravity-field', 'off')
})

test('复核清单汇总测量线并支持 JSON 导出', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await page.getByTestId('toggle-ruler').click()
  const capture = page.getByTestId('measurement-capture')
  const box = await capture.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  await capture.click({ force: true, position: { x: 120, y: 120 } })
  await capture.click({ force: true, position: { x: 280, y: 120 } })
  await page.getByRole('button', { name: '复核清单' }).click()
  await expect(page.getByTestId('review-checklist-panel')).toBeVisible()
  await expect(page.getByTestId('review-checklist-item').filter({ hasText: 'measurement' }).first()).toBeVisible()
  await expect(page.locator('[data-testid="review-checklist-item"][data-source="diagnostic"]')).toHaveCount(0)
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-review-json').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('review-checklist.json')
})

test('手动模式默认隐藏容量占用卡以释放画布空间', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  await expect(page.getByTestId('remaining-capacity')).toHaveCount(0)
})

test('手动模式选中前不显示 3D 浮层', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-gizmo-visible', 'false')
  await expect(scene).toHaveAttribute('data-selected-orientation', '')
})

test('补装建议面板提示每次最多 50 件限制', async ({ page }) => {
  await ensureChinese(page)
  await page.getByRole('button', { name: '补装建议' }).click()
  await expect(page.getByTestId('fill-cap-note')).toContainText('50')
})

test('pool ghost 默认存在但无激活；data attribute 完整', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-pool-ghost-active', 'false')
  await expect(scene).toHaveAttribute('data-pool-ghost-invalid', 'false')
})

test('手动模式最大化保留 pool 与测量列表，仅隐藏报告面板', async ({ page }) => {
  await ensureChinese(page)
  await enterManualMode(page)
  const workspace = page.getByTestId('manual-workspace')
  await expect(workspace).toHaveAttribute('data-workspace-maximized', 'false')
  await expect(page.getByTestId('manual-pool')).toBeVisible()
  await expect(page.getByTestId('report-panel')).toBeVisible()
  await expect(page.getByTestId('archive-stat-grid')).toBeVisible()
  const canvas = page.getByTestId('manual-view-container')
  const canvasBox = await canvas.boundingBox()
  const buttonBox = await page.getByTestId('maximize-workspace').boundingBox()
  expect(canvasBox).not.toBeNull()
  expect(buttonBox).not.toBeNull()
  if (canvasBox && buttonBox) {
    expect(buttonBox.x + buttonBox.width).toBeGreaterThan(canvasBox.x + canvasBox.width - 220)
    expect(buttonBox.y).toBeLessThan(canvasBox.y + 80)
  }
  await page.getByTestId('maximize-workspace').click()
  await expect(workspace).toHaveAttribute('data-workspace-maximized', 'true')
  // Pool and measurement tools must still be visible; selected-box rotation now lives in the 3D scene.
  await expect(page.getByTestId('manual-pool')).toBeVisible()
  await expect(page.getByTestId('measurement-list')).toBeVisible()
  await expect(page.getByTestId('report-panel')).toBeHidden()
  await expect(page.getByTestId('archive-stat-grid')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(workspace).toHaveAttribute('data-workspace-maximized', 'false')
  await expect(page.getByTestId('archive-stat-grid')).toBeVisible()
})

test('自动模式工作区也提供最大化按钮并隐藏报告面板', async ({ page }) => {
  await ensureChinese(page)
  const workspace = page.getByTestId('visual-workspace')
  await expect(workspace).toHaveAttribute('data-workspace-maximized', 'false')
  await expect(page.getByTestId('report-panel')).toBeVisible()
  await expect(page.getByTestId('archive-stat-grid')).toBeVisible()
  const canvas = page.getByTestId('auto-view-container')
  const canvasBox = await canvas.boundingBox()
  const buttonBox = await page.getByTestId('maximize-workspace').boundingBox()
  expect(canvasBox).not.toBeNull()
  expect(buttonBox).not.toBeNull()
  if (canvasBox && buttonBox) {
    expect(buttonBox.x + buttonBox.width).toBeGreaterThan(canvasBox.x + canvasBox.width - 220)
    expect(buttonBox.y).toBeLessThan(canvasBox.y + 80)
  }
  await page.getByTestId('maximize-workspace').click()
  await expect(workspace).toHaveAttribute('data-workspace-maximized', 'true')
  await expect(page.getByTestId('report-panel')).toBeHidden()
  await expect(page.getByTestId('archive-stat-grid')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(workspace).toHaveAttribute('data-workspace-maximized', 'false')
  await expect(page.getByTestId('archive-stat-grid')).toBeVisible()
})

test('边缘吸附按钮切换 data-edge-snap', async ({ page }) => {
  await ensureChinese(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-edge-snap', 'on')
  await page.getByLabel('工作台菜单').click()
  await page.getByTestId('snap-settings-toggle').click()
  await expect(page.getByTestId('visual-workspace').getByTestId('toggle-edge-snap')).toHaveCount(0)
  await page.getByTestId('toggle-edge-snap').click()
  await expect(scene).toHaveAttribute('data-edge-snap', 'off')
  await page.getByTestId('toggle-edge-snap').click()
  await expect(scene).toHaveAttribute('data-edge-snap', 'on')
})

test('排布设置和吸附设置独立，吸附设置支持总开关和用户级保存', async ({ page }) => {
  await ensureChinese(page)
  await expect(page.getByTestId('visual-workspace').getByTestId('placement-settings-toggle')).toHaveCount(0)
  await expect(page.getByTestId('visual-workspace').getByTestId('snap-settings-toggle')).toHaveCount(0)
  await page.getByLabel('工作台菜单').click()
  await page.getByTestId('placement-settings-toggle').click()
  const panel = page.getByTestId('placement-settings-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId('toggle-grid-snap')).toHaveCount(0)
  await expect(panel.getByLabel('边缘容差 (mm)')).toHaveCount(0)
  await panel.getByLabel('允许部分悬空').check()
  await panel.getByLabel('最低支撑').fill('30')
  await page.getByTestId('snap-settings-toggle').click()
  const snapPanel = page.getByTestId('snap-settings-panel')
  await expect(snapPanel).toBeVisible()
  await expect(snapPanel.getByLabel('允许部分悬空')).toHaveCount(0)
  await snapPanel.getByLabel('边缘容差 (mm)').fill('80')
  await snapPanel.getByTestId('toggle-snap').click()
  await expect(page.getByTestId('container-scene')).toHaveAttribute('data-grid-snap', 'off')
  await expect(page.getByTestId('container-scene')).toHaveAttribute('data-edge-snap', 'off')
  await page.reload()
  await ensureChinese(page)
  await page.getByLabel('工作台菜单').click()
  await page.getByTestId('placement-settings-toggle').click()
  const reloadedPanel = page.getByTestId('placement-settings-panel')
  await expect(reloadedPanel.getByLabel('允许部分悬空')).toBeChecked()
  await expect(reloadedPanel.getByLabel('最低支撑')).toHaveValue('30')
  await page.getByTestId('snap-settings-toggle').click()
  const reloadedSnapPanel = page.getByTestId('snap-settings-panel')
  await expect(reloadedSnapPanel.getByLabel('边缘容差 (mm)')).toHaveValue('80')
  await expect(reloadedSnapPanel.getByTestId('toggle-snap')).not.toBeChecked()
})

test('Balance 车型选择切换 overlay profile', async ({ page }) => {
  await ensureChinese(page)
  await page.getByRole('button', { name: '装载重心' }).click()
  await page.getByTestId('cog-toggle-3d').click()
  await expect(page.getByTestId('container-scene')).toHaveAttribute('data-cog-overlay', 'on')
  await page.getByTestId('cog-vehicle-select').selectOption('flatbed')
  // selecting a different profile rebuilds overlay; data-cog-overlay stays on
  await expect(page.getByTestId('container-scene')).toHaveAttribute('data-cog-overlay', 'on')
})

test('通知栏按钮显示未读红点，点击后已读', async ({ page }) => {
  await ensureChinese(page)
  // Clear release-notes marker so the user sees unread state regardless of past runs.
  await page.evaluate(() => {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith('cargo_release_notes_read_v1__'))
      .forEach((k) => window.localStorage.removeItem(k))
  })
  // Force the button to re-read localStorage by toggling the user via a navigation.
  await page.getByRole('button', { name: '历史方案', exact: true }).click()
  await page.getByRole('button', { name: '工作台', exact: true }).click()
  const btn = page.getByTestId('release-notes-open')
  await expect(btn).toContainText('通知栏')
  await expect(btn).toHaveAttribute('data-release-notes-unread', 'true')
  await btn.click()
  await expect(page.getByTestId('release-notes-modal')).toBeVisible()
  await page.getByTestId('release-notes-mark-read').click()
  await page.getByTestId('release-notes-close').click()
  await expect(btn).toHaveAttribute('data-release-notes-unread', 'false')
})

test('管理员主导航包含用户管理入口', async ({ page }) => {
  // beforeEach logged in as testuser; switch to admin.
  await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    }).then((r) => r.json())
    window.localStorage.setItem('cargo_token', res.token)
    window.localStorage.setItem('cargo_user', JSON.stringify(res.user))
  })
  await page.goto('/')
  await expect(page.getByTestId('nav-users')).toBeVisible()
  await page.getByTestId('nav-users').click()
  await expect(page.getByTestId('users-page')).toBeVisible()
})

test('普通用户主导航不显示用户管理', async ({ page }) => {
  await expect(page.getByTestId('report-panel')).toBeVisible()
  await expect(page.getByTestId('nav-users')).toHaveCount(0)
})
