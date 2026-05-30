# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: manual-3d.spec.ts >> 手动模式 R 与 Shift+R 更新朝向示意图
- Location: e2e\manual-3d.spec.ts:143:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  getByTestId('manual-orientation-diagram')
Expected: "WHL"
Received: "WLH"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" with timeout 5000ms
  - waiting for getByTestId('manual-orientation-diagram')
    14 × locator resolved to <div data-orientation="WLH" data-testid="manual-orientation-diagram" class="mb-2 rounded-lg border border-[#cbd5e1] bg-[#f8fafc] p-2">…</div>
       - unexpected value "WLH"

```

```yaml
- text: 朝向 X:W+ Y:L- Z:T+ X:W+ Y:L- Z:T+ X W+ Y L- Z T+
- paragraph: "支撑: 50%"
```

# Test source

```ts
  60  |       badgeBox.x + badgeBox.width > undoBox.x &&
  61  |       badgeBox.y < undoBox.y + undoBox.height &&
  62  |       badgeBox.y + badgeBox.height > undoBox.y
  63  |     expect(overlaps).toBe(false)
  64  |   }
  65  | })
  66  | 
  67  | test('手动模式 2D 视角切换前/侧视图，SVG viewBox 随之变化', async ({ page }) => {
  68  |   await ensureChinese(page)
  69  |   await enterManualMode(page)
  70  |   await page.getByRole('button', { name: '2D', exact: true }).click()
  71  | 
  72  |   const svg = page.getByTestId('manual-placement-2d')
  73  |   await expect(svg).toHaveAttribute('data-view-mode', 'top')
  74  |   const topViewBox = await svg.getAttribute('viewBox')
  75  | 
  76  |   await page.getByRole('button', { name: '正视', exact: true }).click()
  77  |   await expect(svg).toHaveAttribute('data-view-mode', 'front')
  78  |   const frontViewBox = await svg.getAttribute('viewBox')
  79  |   expect(frontViewBox).not.toBe(topViewBox)
  80  | 
  81  |   await page.getByRole('button', { name: '侧视', exact: true }).click()
  82  |   await expect(svg).toHaveAttribute('data-view-mode', 'side')
  83  |   const sideViewBox = await svg.getAttribute('viewBox')
  84  |   expect(sideViewBox).not.toBe(frontViewBox)
  85  | })
  86  | 
  87  | test('手动模式 3D 暴露 manualEditable canvas，pool 项目可拖拽', async ({ page }) => {
  88  |   await ensureChinese(page)
  89  |   await enterManualMode(page)
  90  |   const scene = page.getByTestId('container-scene')
  91  |   await expect(scene).toBeVisible()
  92  |   await expect(scene).toHaveAttribute('data-interaction-mode', 'manual')
  93  |   await expect(scene).toHaveAttribute('data-controls-enabled', 'true')
  94  | 
  95  |   const poolItems = page.getByTestId('manual-pool-item')
  96  |   const count = await poolItems.count()
  97  |   expect(count).toBeGreaterThan(0)
  98  |   await expect(poolItems.first()).toHaveAttribute('draggable', 'true')
  99  | })
  100 | 
  101 | test('手动模式默认即可旋转视角与拖箱，显示旋转提示', async ({ page }) => {
  102 |   await ensureChinese(page)
  103 |   await enterManualMode(page)
  104 |   const scene = page.getByTestId('container-scene')
  105 |   await expect(scene).toHaveAttribute('data-interaction-mode', 'manual')
  106 |   await expect(scene).toHaveAttribute('data-controls-enabled', 'true')
  107 |   await expect(page.getByTestId('manual-rotate-hint')).toContainText('中键')
  108 | })
  109 | 
  110 | test('手动模式键盘帮助展示 Z 轴与快捷键说明', async ({ page }) => {
  111 |   await ensureChinese(page)
  112 |   await enterManualMode(page)
  113 |   await page.getByTestId('manual-keyboard-help').click()
  114 |   const popover = page.getByTestId('manual-keyboard-help-popover')
  115 |   await expect(popover).toContainText('Shift + 拖拽')
  116 |   await expect(popover).toContainText('PageUp/PageDown')
  117 |   await expect(popover).toContainText('Ctrl/Cmd = 1 mm')
  118 |   await expect(popover).toContainText('Shift + R')
  119 |   await expect(popover).toContainText('Delete')
  120 |   await expect(popover).toContainText('Esc')
  121 | })
  122 | 
  123 | test('手动模式阻止键盘把箱体移动到悬空位置', async ({ page }) => {
  124 |   await ensureChinese(page)
  125 |   await page.getByRole('button', { name: '继续手动微调' }).click()
  126 |   await expect(page.getByTestId('manual-workspace')).toBeVisible()
  127 |   await expect(page.getByTestId('container-scene')).toHaveAttribute('data-box-count', '18')
  128 | 
  129 |   await page.getByRole('button', { name: '2D', exact: true }).click()
  130 |   const firstManualBox = page.locator('[data-box-id]').first()
  131 |   await firstManualBox.dispatchEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
  132 |   await expect(page.getByTestId('manual-delete')).toBeEnabled()
  133 |   await page.getByRole('button', { name: '3D', exact: true }).click()
  134 | 
  135 |   const scene = page.getByTestId('container-scene')
  136 |   await expect(scene).toHaveAttribute('data-box-count', '18')
  137 |   await page.keyboard.press('PageUp')
  138 |   await expect(page.getByTestId('manual-operation-notice')).toBeVisible()
  139 |   await expect(page.getByTestId('manual-issues')).toHaveCount(0)
  140 |   await expect(scene).toHaveAttribute('data-box-count', '18')
  141 | })
  142 | 
  143 | test('手动模式 R 与 Shift+R 更新朝向示意图', async ({ page }) => {
  144 |   await ensureChinese(page)
  145 |   await page.getByRole('button', { name: '继续手动微调' }).click()
  146 |   await page.getByRole('button', { name: '2D', exact: true }).click()
  147 |   await page.locator('[data-box-id]').first().dispatchEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
  148 |   await page.getByTestId('manual-precise-input-x').fill('2400')
  149 |   await page.getByTestId('manual-precise-input-y').fill('1200')
  150 |   await page.getByTestId('manual-precise-input-z').fill('0')
  151 |   await page.getByTestId('manual-precise-apply').click()
  152 |   const diagram = page.getByTestId('manual-orientation-diagram')
  153 |   await expect(diagram).toHaveAttribute('data-orientation', 'LWH')
  154 |   await page.keyboard.press('R')
  155 |   await expect(diagram).toHaveAttribute('data-orientation', 'WLH')
  156 |   await expect(diagram).toContainText('X:W+')
  157 |   await expect(diagram).toContainText('Y:L-')
  158 |   await expect(diagram).toContainText('Z:T+')
  159 |   await page.keyboard.press('Shift+R')
> 160 |   await expect(diagram).toHaveAttribute('data-orientation', 'WHL')
      |                         ^ Error: expect(locator).toHaveAttribute(expected) failed
  161 |   await expect(page.getByTestId('manual-orientation-marker').first()).toHaveAttribute('data-orientation', 'WHL')
  162 |   await expect(page.getByTestId('manual-orientation-marker').first()).toContainText(/X:W\+ Y:T\+ Z:L\+/)
  163 |   await expect(diagram).not.toContainText('H')
  164 | })
  165 | 
  166 | test('尺规在 2D 中创建固定测量线并可删除', async ({ page }) => {
  167 |   await ensureChinese(page)
  168 |   await enterManualMode(page)
  169 |   await page.getByRole('button', { name: '2D', exact: true }).click()
  170 |   await page.getByTestId('toggle-ruler').click()
  171 |   const capture = page.getByTestId('measurement-capture')
  172 |   const box = await capture.boundingBox()
  173 |   expect(box).not.toBeNull()
  174 |   if (!box) return
  175 |   await capture.click({ force: true, position: { x: 120, y: 120 } })
  176 |   await expect(page.getByTestId('measurement-draft-point')).toBeVisible()
  177 |   await capture.click({ force: true, position: { x: 260, y: 170 } })
  178 |   await expect(page.getByTestId('measurement-line')).toHaveCount(1)
  179 |   await expect(page.getByTestId('measurement-list-item')).toHaveCount(1)
  180 |   await page.getByTestId('measurement-list-item').getByRole('button', { name: '删除' }).click()
  181 |   await expect(page.getByTestId('measurement-line')).toHaveCount(0)
  182 | })
  183 | 
  184 | test('自动模式默认即可旋转，重置视角按钮可用', async ({ page }) => {
  185 |   await ensureChinese(page)
  186 |   const scene = page.getByTestId('container-scene')
  187 |   await expect(scene).toBeVisible()
  188 |   await expect(scene).toHaveAttribute('data-interaction-mode', 'auto')
  189 |   await expect(scene).toHaveAttribute('data-controls-enabled', 'true')
  190 |   await page.getByTestId('reset-view').click()
  191 |   await expect(scene).toHaveAttribute('data-interaction-mode', 'auto')
  192 | })
  193 | 
  194 | test('自动模式更换货柜后清空旧画布并提示重新计算', async ({ page }) => {
  195 |   await ensureChinese(page)
  196 |   const scene = page.getByTestId('container-scene')
  197 |   await expect(scene).toBeVisible()
  198 |   await page.getByLabel('货柜类型').selectOption({ index: 1 })
  199 |   await expect(page.getByTestId('container-change-notice')).toContainText('重新计算')
  200 |   await expect(scene).toHaveAttribute('data-box-count', '0')
  201 |   await expect(scene).toHaveAttribute('data-interaction-mode', 'auto')
  202 | })
  203 | 
  204 | test('从历史方案恢复自定义柜型后 3D 场景重建并显示新箱体', async ({ page }) => {
  205 |   await ensureChinese(page)
  206 | 
  207 |   await page.getByLabel('货柜类型').selectOption('custom')
  208 |   await page.getByLabel('长 mm').first().fill('14000')
  209 |   await page.getByLabel('宽 mm').first().fill('2350')
  210 |   await page.getByLabel('高 mm').first().fill('2600')
  211 |   await page.getByLabel('最大载重 kg').fill('30000')
  212 | 
  213 |   const cargoForm = page.locator('form')
  214 |   await cargoForm.getByLabel('名称', { exact: true }).fill('恢复探针')
  215 |   await cargoForm.getByLabel('标识', { exact: true }).fill('P')
  216 |   await cargoForm.getByLabel('长 mm').fill('1200')
  217 |   await cargoForm.getByLabel('宽 mm').fill('800')
  218 |   await cargoForm.getByLabel('高 mm').fill('900')
  219 |   await cargoForm.getByLabel('重量 kg').fill('100')
  220 |   await cargoForm.getByLabel('数量', { exact: true }).fill('5')
  221 |   await page.getByRole('button', { name: '+ 添加货物' }).click()
  222 | 
  223 |   await page.getByRole('button', { name: '装箱', exact: true }).click()
  224 |   await page.getByRole('button', { name: '历史方案', exact: true }).click()
  225 |   await page.getByRole('button', { name: '保存方案' }).click()
  226 |   await page.waitForTimeout(300)
  227 | 
  228 |   await page.getByRole('button', { name: '工作台', exact: true }).click()
  229 |   await page.getByRole('button', { name: '新建项目' }).click()
  230 |   await page.waitForTimeout(150)
  231 | 
  232 |   await page.getByRole('button', { name: '历史方案', exact: true }).click()
  233 |   await page.getByRole('button', { name: '恢复' }).first().click()
  234 |   await page.waitForTimeout(400)
  235 | 
  236 |   await expect(page.getByText('14,000 × 2,350 × 2,600 mm')).toBeVisible({ timeout: 5000 })
  237 | 
  238 |   const canvas = page.locator('canvas').first()
  239 |   await expect(canvas).toBeVisible()
  240 |   await page.waitForTimeout(400)
  241 | 
  242 |   const colors = await canvas.evaluate((node) => {
  243 |     const el = node as HTMLCanvasElement
  244 |     const gl = el.getContext('webgl2') ?? el.getContext('webgl')
  245 |     if (!gl) return 0
  246 |     const set = new Set<string>()
  247 |     const pixel = new Uint8Array(4)
  248 |     for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) {
  249 |       for (const y of [0.2, 0.35, 0.5, 0.65, 0.8]) {
  250 |         gl.readPixels(Math.floor(el.width * x), Math.floor(el.height * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
  251 |         set.add(`${pixel[0]>>3}:${pixel[1]>>3}:${pixel[2]>>3}`)
  252 |       }
  253 |     }
  254 |     return set.size
  255 |   })
  256 |   expect(colors).toBeGreaterThanOrEqual(4)
  257 | })
  258 | 
  259 | test('?debug=1 显示调试面板并展示当前状态', async ({ page }) => {
  260 |   await page.goto('/?debug=1')
```