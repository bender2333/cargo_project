# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: container-calc.spec.ts >> uses real archive-style navigation, menu, and shipment-name history behavior
- Location: e2e\container-calc.spec.ts:217:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('report-panel')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByTestId('report-panel')

```

```yaml
- heading "货柜装箱计算系统" [level=2]
- paragraph: 集装箱智能排布与装箱复核工作台
- text: "Failed to execute 'json' on 'Response': Unexpected end of JSON input 用户名"
- textbox "用户名":
  - /placeholder: 请输入用户名
  - text: testuser
- text: 密码
- textbox "密码":
  - /placeholder: 请输入密码
  - text: testuser123
- button "登录"
- button "没有账号？立即注册"
```

# Test source

```ts
  71  |       'C,CSV crate,1100,750,550,40,2,#654321,true,false,4',
  72  |     ].join('\n'),
  73  |     'utf8',
  74  |   )
  75  |   return filePath
  76  | }
  77  | 
  78  | async function createEmptyWorkbookFile() {
  79  |   const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-calc-empty-'))
  80  |   const filePath = path.join(dir, 'cargo-import-empty.xlsx')
  81  |   const workbook = XLSX.utils.book_new()
  82  |   XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['label', 'name', 'length']]), 'Empty')
  83  |   XLSX.writeFile(workbook, filePath)
  84  |   return filePath
  85  | }
  86  | 
  87  | async function createTemplateWorkbookFile() {
  88  |   const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-calc-template-'))
  89  |   const filePath = path.join(dir, 'cargo-template.xlsx')
  90  |   const sheet = XLSX.utils.json_to_sheet([
  91  |     {
  92  |       Goods: 'Template only crate',
  93  |       Code: '',
  94  |       L: 80,
  95  |       W: 60,
  96  |       H: 40,
  97  |     },
  98  |   ])
  99  |   const workbook = XLSX.utils.book_new()
  100 |   XLSX.utils.book_append_sheet(workbook, sheet, 'Template Cargo')
  101 |   XLSX.writeFile(workbook, filePath)
  102 |   return filePath
  103 | }
  104 | 
  105 | async function createMissingLengthWorkbookFile() {
  106 |   const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-calc-template-missing-'))
  107 |   const filePath = path.join(dir, 'cargo-template-missing-length.xlsx')
  108 |   const sheet = XLSX.utils.json_to_sheet([
  109 |     {
  110 |       Goods: 'Missing length crate',
  111 |       Code: 'ML',
  112 |       W: 60,
  113 |       H: 40,
  114 |       Qty: 2,
  115 |     },
  116 |   ])
  117 |   const workbook = XLSX.utils.book_new()
  118 |   XLSX.utils.book_append_sheet(workbook, sheet, 'Template Cargo')
  119 |   XLSX.writeFile(workbook, filePath)
  120 |   return filePath
  121 | }
  122 | 
  123 | async function openEnglish(page: Page) {
  124 |   await page.goto('/')
  125 |   await page.getByRole('button', { name: 'English' }).click()
  126 | }
  127 | 
  128 | async function expectCanvasHasRenderedPixels(page: Page) {
  129 |   const canvas = page.locator('canvas').first()
  130 |   await expect(canvas).toBeVisible()
  131 |   await page.waitForTimeout(150)
  132 | 
  133 |   const distinctColors = await canvas.evaluate((node) => {
  134 |     const canvasElement = node as HTMLCanvasElement
  135 |     const gl = canvasElement.getContext('webgl2') ?? canvasElement.getContext('webgl')
  136 |     if (!gl) {
  137 |       return 0
  138 |     }
  139 | 
  140 |     const colors = new Set<string>()
  141 |     const pixel = new Uint8Array(4)
  142 |     const xSteps = [0.2, 0.35, 0.5, 0.65, 0.8]
  143 |     const ySteps = [0.2, 0.35, 0.5, 0.65, 0.8]
  144 |     xSteps.forEach((xStep) => {
  145 |       ySteps.forEach((yStep) => {
  146 |         gl.readPixels(
  147 |           Math.floor(canvasElement.width * xStep),
  148 |           Math.floor(canvasElement.height * yStep),
  149 |           1,
  150 |           1,
  151 |           gl.RGBA,
  152 |           gl.UNSIGNED_BYTE,
  153 |           pixel,
  154 |         )
  155 |         colors.add(`${Math.floor(pixel[0] / 8)}:${Math.floor(pixel[1] / 8)}:${Math.floor(pixel[2] / 8)}:${pixel[3]}`)
  156 |       })
  157 |     })
  158 | 
  159 |     return colors.size
  160 |   })
  161 | 
  162 |   expect(distinctColors).toBeGreaterThan(1)
  163 | }
  164 | 
  165 | test.beforeEach(async ({ page }) => {
  166 |   await page.goto('/')
  167 |   if (await page.locator('#username').isVisible()) {
  168 |     await page.fill('#username', 'testuser')
  169 |     await page.fill('#password', 'testuser123')
  170 |     await page.click('button[type="submit"]')
> 171 |     await expect(page.getByTestId('report-panel')).toBeVisible()
      |                                                    ^ Error: expect(locator).toBeVisible() failed
  172 |     await page.evaluate(async () => {
  173 |       const token = window.localStorage.getItem('cargo_token')
  174 |       if (!token) return
  175 |       await fetch('/api/history', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  176 |     })
  177 |   }
  178 | })
  179 | 
  180 | test('loads the container calculator workspace', async ({ page }) => {
  181 |   await page.goto('/')
  182 |   await expect(page.locator('header').getByRole('button', { name: '工作台' })).toBeVisible()
  183 |   await expect(page.locator('header').getByRole('button', { name: '历史方案' })).toBeVisible()
  184 |   await expect(page.locator('header').getByRole('button', { name: 'EasyCargo' })).toHaveCount(0)
  185 |   await expect(page.locator('header').getByRole('button', { name: '装箱报告' })).toHaveCount(0)
  186 |   await expect(page.locator('header').getByRole('button', { name: '货物项目' })).toHaveCount(0)
  187 |   await expect(page.locator('header').getByRole('button', { name: '货柜空间' })).toHaveCount(0)
  188 |   await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
  189 |   await expect(page.getByText('装箱计算、可视化复核、导入导出和本地历史方案')).toHaveCount(0)
  190 |   await expect(page.getByText('货柜参数')).toBeVisible()
  191 |   await expect(page.getByText('装载规则')).toBeVisible()
  192 |   await expect(page.getByTestId('report-panel')).toBeVisible()
  193 |   await expect(page.getByTestId('visual-workspace')).toBeVisible()
  194 |   await expect(page.getByTestId('container-scene')).toBeVisible()
  195 | 
  196 |   await page.getByRole('button', { name: 'English' }).click()
  197 |   await expect(page.locator('header').getByRole('button', { name: 'Workbench' })).toBeVisible()
  198 |   await expect(page.locator('header').getByRole('button', { name: 'History' })).toBeVisible()
  199 |   await expect(page.locator('header').getByRole('button', { name: 'EasyCargo' })).toHaveCount(0)
  200 |   await expect(page.locator('header').getByRole('button', { name: 'Shipments & Reports' })).toHaveCount(0)
  201 |   await expect(page.locator('header').getByRole('button', { name: 'Cargo items' })).toHaveCount(0)
  202 |   await expect(page.locator('header').getByRole('button', { name: 'Cargo spaces' })).toHaveCount(0)
  203 |   await expect(page.getByText('Container packing, visual review, import/export, and local plan history')).toHaveCount(0)
  204 |   await expect(page.getByText('Pallet / cargo unit parameters')).toBeVisible()
  205 |   await expect(page.getByText('Loading rules')).toBeVisible()
  206 |   await expect(page.getByText('Cargo loading workspace')).toBeVisible()
  207 |   await expect(page.getByTestId('archive-stat-grid')).toBeVisible()
  208 |   await expect(page.getByRole('button', { name: 'Users' })).toHaveCount(0)
  209 |   await expect(page.getByRole('button', { name: 'Licenses' })).toHaveCount(0)
  210 |   await expect(page.getByTestId('project-name-input')).toHaveCount(0)
  211 |   await expect(page.getByTestId('new-project-button')).toHaveCount(0)
  212 |   await expect(page.getByTestId('save-project-button')).toHaveCount(0)
  213 |   await expect(page.getByTestId('upload-project-input')).toHaveCount(0)
  214 |   await expect(page.getByTestId('container-scene')).toBeVisible()
  215 | })
  216 | 
  217 | test('uses real archive-style navigation, menu, and shipment-name history behavior', async ({ page }) => {
  218 |   await openEnglish(page)
  219 |   await page.getByLabel('Shipment name').fill('Review regression plan')
  220 | 
  221 |   await page.getByRole('button', { name: 'Workspace menu' }).click()
  222 |   await expect(page.getByTestId('workspace-menu')).toBeVisible()
  223 |   await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'Workbench' })).toBeVisible()
  224 |   await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'History' })).toBeVisible()
  225 |   await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'Cargo library' })).toBeVisible()
  226 |   await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'Template manager' })).toBeVisible()
  227 |   await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'Cargo items' })).toHaveCount(0)
  228 |   await page.getByTestId('workspace-menu').getByRole('button', { name: 'Workbench' }).click()
  229 |   await expect(page.locator('header').getByRole('button', { name: 'Workbench' })).toHaveClass(/bg-white/)
  230 |   await expect(page.getByTestId('cargo-panel')).toBeVisible()
  231 |   await expect(page.getByTestId('container-panel')).toBeVisible()
  232 |   await expect(page.getByTestId('report-panel')).toBeVisible()
  233 | 
  234 |   await page.getByRole('button', { name: 'History', exact: true }).click()
  235 |   await expect(page.getByTestId('history-page')).toBeVisible()
  236 |   await page.getByRole('button', { name: 'Save plan' }).click()
  237 |   await expect(page.getByText('Shipment: Review regression plan')).toBeVisible()
  238 | 
  239 |   await page.getByRole('button', { name: 'Back to workbench' }).click()
  240 |   await page.getByLabel('Shipment name').fill('Changed plan')
  241 |   await page.getByRole('button', { name: 'History', exact: true }).click()
  242 |   await page.getByRole('button', { name: 'Restore' }).first().click()
  243 |   await expect(page.getByLabel('Shipment name')).toHaveValue('Review regression plan')
  244 | })
  245 | 
  246 | test('exports shipment-prefixed workbook data from the named plan', async ({ page }) => {
  247 |   await openEnglish(page)
  248 |   await page.getByLabel('Shipment name').fill('Prefix Plan')
  249 | 
  250 |   const downloadPromise = page.waitForEvent('download')
  251 |   await page.getByRole('button', { name: 'Export XLSX' }).click()
  252 |   const download = await downloadPromise
  253 |   expect(download.suggestedFilename()).toBe('prefix-plan-packing-plan.xlsx')
  254 | 
  255 |   const exportPath = path.join(os.tmpdir(), `cargo-export-prefix-${Date.now()}.xlsx`)
  256 |   await download.saveAs(exportPath)
  257 |   const exported = XLSX.read(await fs.readFile(exportPath), { type: 'buffer' })
  258 |   expect(exported.SheetNames[0]).toBe('Shipment')
  259 |   const shipmentRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(exported.Sheets.Shipment)
  260 |   expect(shipmentRows[0]).toMatchObject({
  261 |     shipmentName: 'Prefix Plan',
  262 |     container: "Container 20'",
  263 |     loadingMode: 'quantity',
  264 |   })
  265 | })
  266 | 
  267 | test('updates parameters when selecting another container', async ({ page }) => {
  268 |   await openEnglish(page)
  269 |   const target = page.getByRole('button', { name: /Container 45' HC/ }).first()
  270 |   await target.click()
  271 |   await expect(target).toHaveClass(/bg-white/)
```