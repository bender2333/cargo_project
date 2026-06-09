import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import * as XLSX from 'xlsx'

async function createWorkbookFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-calc-'))
  const filePath = path.join(dir, 'cargo-import.xlsx')
  const sheet = XLSX.utils.json_to_sheet([
    {
      label: 'D',
      name: 'Imported crate',
      length: 900,
      width: 700,
      height: 500,
      weight: 33,
      quantity: 2,
      color: '#123456',
      canRotate: true,
      stackable: false,
      maxStackLayers: 4,
    },
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Cargo Items')
  XLSX.writeFile(workbook, filePath)
  return filePath
}

async function createChineseWorkbookFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-calc-zh-'))
  const filePath = path.join(dir, 'cargo-import-zh.xlsx')
  const sheet = XLSX.utils.json_to_sheet([
    {
      托盘: 'p1',
      货物名称: '整托货物',
      长cm: 90,
      宽cm: 70,
      高cm: 50,
      整托重量kg: 33,
      数量: 2,
      颜色: '#123456',
      允许旋转: '是',
      允许堆叠: '否',
      最大堆叠层数: 4,
    },
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Cargo Items')
  XLSX.writeFile(workbook, filePath)
  return filePath
}

function realWorkbookPath() {
  return path.join(process.cwd(), 'test-data', 'excel', '俄罗斯整托装柜尺寸.xlsx')
}

function vietnamWorkbookPath() {
  return path.join(process.cwd(), 'test-data', 'excel', '越南第十一批6.2海运.xlsx')
}

async function createCsvFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-calc-csv-'))
  const filePath = path.join(dir, 'cargo-import.csv')
  await fs.writeFile(
    filePath,
    [
      'label,name,length,width,height,weight,quantity,color,canRotate,stackable,maxStackLayers',
      'C,CSV crate,1100,750,550,40,2,#654321,true,false,4',
    ].join('\n'),
    'utf8',
  )
  return filePath
}

async function createEmptyWorkbookFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-calc-empty-'))
  const filePath = path.join(dir, 'cargo-import-empty.xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['label', 'name', 'length']]), 'Empty')
  XLSX.writeFile(workbook, filePath)
  return filePath
}

async function createTemplateWorkbookFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-calc-template-'))
  const filePath = path.join(dir, 'cargo-template.xlsx')
  const sheet = XLSX.utils.json_to_sheet([
    {
      Goods: 'Template only crate',
      Code: '',
      L: 80,
      W: 60,
      H: 40,
    },
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Template Cargo')
  XLSX.writeFile(workbook, filePath)
  return filePath
}

async function openEnglish(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'English' }).click()
}

async function expectCanvasHasRenderedPixels(page: Page) {
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  await page.waitForTimeout(150)

  const distinctColors = await canvas.evaluate((node) => {
    const canvasElement = node as HTMLCanvasElement
    const gl = canvasElement.getContext('webgl2') ?? canvasElement.getContext('webgl')
    if (!gl) {
      return 0
    }

    const colors = new Set<string>()
    const pixel = new Uint8Array(4)
    const xSteps = [0.2, 0.35, 0.5, 0.65, 0.8]
    const ySteps = [0.2, 0.35, 0.5, 0.65, 0.8]
    xSteps.forEach((xStep) => {
      ySteps.forEach((yStep) => {
        gl.readPixels(
          Math.floor(canvasElement.width * xStep),
          Math.floor(canvasElement.height * yStep),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        )
        colors.add(`${Math.floor(pixel[0] / 8)}:${Math.floor(pixel[1] / 8)}:${Math.floor(pixel[2] / 8)}:${pixel[3]}`)
      })
    })

    return colors.size
  })

  expect(distinctColors).toBeGreaterThan(1)
}

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

test('loads the container calculator workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('header').getByRole('button', { name: '工作台' })).toBeVisible()
  await expect(page.locator('header').getByRole('button', { name: '历史方案' })).toBeVisible()
  await expect(page.locator('header').getByRole('button', { name: 'EasyCargo' })).toHaveCount(0)
  await expect(page.locator('header').getByRole('button', { name: '装箱报告' })).toHaveCount(0)
  await expect(page.locator('header').getByRole('button', { name: '货物项目' })).toHaveCount(0)
  await expect(page.locator('header').getByRole('button', { name: '货柜空间' })).toHaveCount(0)
  await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
  await expect(page.getByText('装箱计算、可视化复核、导入导出和本地历史方案')).toHaveCount(0)
  await expect(page.getByText('货柜参数')).toBeVisible()
  await expect(page.getByText('装载规则')).toBeVisible()
  await expect(page.getByTestId('report-panel')).toBeVisible()
  await expect(page.getByTestId('visual-workspace')).toBeVisible()
  await expect(page.getByTestId('container-scene')).toBeVisible()

  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('header').getByRole('button', { name: 'Workbench' })).toBeVisible()
  await expect(page.locator('header').getByRole('button', { name: 'History' })).toBeVisible()
  await expect(page.locator('header').getByRole('button', { name: 'EasyCargo' })).toHaveCount(0)
  await expect(page.locator('header').getByRole('button', { name: 'Shipments & Reports' })).toHaveCount(0)
  await expect(page.locator('header').getByRole('button', { name: 'Cargo items' })).toHaveCount(0)
  await expect(page.locator('header').getByRole('button', { name: 'Cargo spaces' })).toHaveCount(0)
  await expect(page.getByText('Container packing, visual review, import/export, and local plan history')).toHaveCount(0)
  await expect(page.getByText('Pallet / cargo unit parameters')).toBeVisible()
  await expect(page.getByText('Loading rules')).toBeVisible()
  await expect(page.getByText('Cargo loading workspace')).toBeVisible()
  await expect(page.getByTestId('archive-stat-grid')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Users' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Licenses' })).toHaveCount(0)
  await expect(page.getByTestId('project-name-input')).toHaveCount(0)
  await expect(page.getByTestId('new-project-button')).toHaveCount(0)
  await expect(page.getByTestId('save-project-button')).toHaveCount(0)
  await expect(page.getByTestId('upload-project-input')).toHaveCount(0)
  await expect(page.getByTestId('container-scene')).toBeVisible()
})

test('uses real archive-style navigation, menu, and shipment-name history behavior', async ({ page }) => {
  await openEnglish(page)
  await page.getByLabel('Shipment name').fill('Review regression plan')

  await page.getByRole('button', { name: 'Workspace menu' }).click()
  await expect(page.getByTestId('workspace-menu')).toBeVisible()
  await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'Workbench' })).toBeVisible()
  await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'History' })).toBeVisible()
  await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'Cargo library' })).toBeVisible()
  await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'Template manager' })).toBeVisible()
  await expect(page.getByTestId('workspace-menu').getByRole('button', { name: 'Cargo items' })).toHaveCount(0)
  await page.getByTestId('workspace-menu').getByRole('button', { name: 'Workbench' }).click()
  await expect(page.locator('header').getByRole('button', { name: 'Workbench' })).toHaveClass(/bg-white/)
  await expect(page.getByTestId('cargo-panel')).toBeVisible()
  await expect(page.getByTestId('container-panel')).toBeVisible()
  await expect(page.getByTestId('report-panel')).toBeVisible()

  await page.getByRole('button', { name: 'History', exact: true }).click()
  await expect(page.getByTestId('history-page')).toBeVisible()
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText('Shipment: Review regression plan')).toBeVisible()

  await page.getByRole('button', { name: 'Back to workbench' }).click()
  await page.getByLabel('Shipment name').fill('Changed plan')
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'Restore' }).first().click()
  await expect(page.getByLabel('Shipment name')).toHaveValue('Review regression plan')
})

test('exports shipment-prefixed workbook data from the named plan', async ({ page }) => {
  await openEnglish(page)
  await page.getByLabel('Shipment name').fill('Prefix Plan')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export XLSX' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('prefix-plan-packing-plan.xlsx')

  const exportPath = path.join(os.tmpdir(), `cargo-export-prefix-${Date.now()}.xlsx`)
  await download.saveAs(exportPath)
  const exported = XLSX.read(await fs.readFile(exportPath), { type: 'buffer' })
  expect(exported.SheetNames[0]).toBe('Shipment')
  const shipmentRows = XLSX.utils.sheet_to_json<Record<string, string | number>>(exported.Sheets.Shipment)
  expect(shipmentRows[0]).toMatchObject({
    shipmentName: 'Prefix Plan',
    container: "Container 20'",
    loadingMode: 'quantity',
  })
})

test('updates parameters when selecting another container', async ({ page }) => {
  await openEnglish(page)
  const target = page.getByRole('button', { name: /Container 45' HC/ }).first()
  await target.click()
  await expect(target).toHaveClass(/bg-white/)
})

test('shows custom container fields and effective dimensions', async ({ page }) => {
  await openEnglish(page)
  await page.getByLabel('Container type').selectOption('custom')
  await page.getByLabel('Length mm').first().fill('15000')
  await page.getByLabel('Width mm').first().fill('2400')
  await page.getByLabel('Height mm').first().fill('2600')
  await page.getByLabel('Max payload kg').fill('28000')
  await page.getByLabel('Door gap mm').fill('300')
  await page.getByLabel('Top gap mm').fill('100')
  await page.getByLabel('Side gap mm').fill('50')

  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Effective length probe')
  await cargoForm.getByLabel('Length mm').fill('14800')
  await cargoForm.getByLabel('Width mm').fill('400')
  await cargoForm.getByLabel('Height mm').fill('400')
  await cargoForm.getByLabel('Weight kg').fill('10')
  await cargoForm.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'Exceeds container dimensions' })).toBeVisible()
})

test('adds cargo and recalculates utilization', async ({ page }) => {
  await openEnglish(page)
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Tall crate')
  await cargoForm.getByLabel('Length mm').fill('1200')
  await cargoForm.getByLabel('Width mm').fill('800')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('42')
  await cargoForm.getByLabel('Quantity').fill('3')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await expect(page.getByRole('button', { name: /Tall crate/ }).first()).toBeVisible()
  await expect(page.getByText(/Volume utilization: \d+\.\d%/)).toBeVisible()
  await expect(page.getByText(/Weight utilization: \d+\.\d%/)).toBeVisible()
  await expect(page.getByText('Cargo types: 2')).toBeVisible()
  await expect(page.getByText('Layer view')).toBeVisible()
})

test('applies global max stack layers to cargo without per-item limits', async ({ page }) => {
  await openEnglish(page)
  await page.getByRole('button', { name: /Delete cargo: Carton A/ }).click()
  await page.getByLabel('Container type').selectOption('custom')
  await page.getByLabel('Length mm').first().fill('1000')
  await page.getByLabel('Width mm').first().fill('1000')
  await page.getByLabel('Height mm').first().fill('2000')
  await page.getByLabel('Max payload kg').fill('10000')

  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Global stack crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('GS')
  await cargoForm.getByLabel('Length mm').fill('1000')
  await cargoForm.getByLabel('Width mm').fill('1000')
  await cargoForm.getByLabel('Height mm').fill('500')
  await cargoForm.getByLabel('Weight kg').fill('10')
  await cargoForm.getByLabel('Quantity').fill('3')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()

  await page.getByTestId('global-max-stack-layers-field').getByRole('spinbutton').fill('2')
  await expect(page.getByTestId('cargo-list-item').filter({ hasText: 'Global stack crate' })).toContainText('Max stack layers: 2 (global default)')
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await page.getByRole('button', { name: 'Details' }).click()
  const row = page.getByRole('row').filter({ hasText: 'Global stack crate' })
  await expect(row.getByRole('cell').nth(5)).toHaveText('3')
  await expect(row.getByRole('cell').nth(6)).toHaveText('2')
  await expect(row.getByRole('cell').nth(7)).toHaveText('1')
  await expect(row.getByRole('cell').nth(8)).toHaveText('1')
  await expect(row.getByRole('cell').nth(9)).toHaveText('1, 2')
})

test('adds cargo from the default Chinese workspace', async ({ page }) => {
  await page.goto('/')
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('名称', { exact: true }).fill('中文新增货物')
  await cargoForm.getByLabel('标识', { exact: true }).fill('Z')
  await cargoForm.getByLabel('长 mm').fill('1200')
  await cargoForm.getByLabel('宽 mm').fill('800')
  await cargoForm.getByLabel('高 mm').fill('600')
  await cargoForm.getByLabel('重量 kg').fill('42')
  await cargoForm.getByLabel('数量').fill('3')
  await page.getByRole('button', { name: '+ 添加货物' }).click()

  await expect(page.getByRole('button', { name: /中文新增货物/ }).first()).toBeVisible()
})

test('adds cargo when browser randomUUID is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, 'randomUUID', {
      configurable: true,
      value: undefined,
    })
  })
  await page.goto('/')
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('名称', { exact: true }).fill('HTTP 环境货物')
  await cargoForm.getByLabel('标识', { exact: true }).fill('H')
  await cargoForm.getByLabel('长 mm').fill('1200')
  await cargoForm.getByLabel('宽 mm').fill('800')
  await cargoForm.getByLabel('高 mm').fill('600')
  await cargoForm.getByLabel('重量 kg').fill('42')
  await cargoForm.getByLabel('数量').fill('3')
  await page.getByRole('button', { name: '+ 添加货物' }).click()

  await expect(page.getByRole('button', { name: /HTTP 环境货物/ }).first()).toBeVisible()
})

test('deletes cargo and updates downstream details and export', async ({ page }) => {
  await openEnglish(page)
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Delete me')
  await cargoForm.getByLabel('Label', { exact: true }).fill('D')
  await cargoForm.getByLabel('Length mm').fill('900')
  await cargoForm.getByLabel('Width mm').fill('700')
  await cargoForm.getByLabel('Height mm').fill('500')
  await cargoForm.getByLabel('Weight kg').fill('30')
  await cargoForm.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.getByText('Cargo types: 2')).toBeVisible()

  await page.getByRole('button', { name: 'Delete cargo: Delete me' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.getByRole('button', { name: /Delete me/ })).toHaveCount(0)
  await expect(page.getByText('Cargo types: 1')).toBeVisible()

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'Delete me' })).toHaveCount(0)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export XLSX' }).click()
  const download = await downloadPromise
  const exportPath = path.join(os.tmpdir(), `cargo-export-delete-${Date.now()}.xlsx`)
  await download.saveAs(exportPath)
  const exported = XLSX.read(await fs.readFile(exportPath), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(exported.Sheets['Packing Plan'])
  expect(rows.some((row) => row.name === 'Delete me')).toBe(false)
})

test('edits cargo item details and keeps cancel as a no-op', async ({ page }) => {
  await openEnglish(page)
  const cargoForm = page.locator('form').first()
  await cargoForm.getByLabel('Name', { exact: true }).fill('Editable crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('E')
  await cargoForm.getByLabel('Length mm').fill('900')
  await cargoForm.getByLabel('Width mm').fill('700')
  await cargoForm.getByLabel('Height mm').fill('500')
  await cargoForm.getByLabel('Weight kg').fill('30')
  await cargoForm.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()

  await page.getByRole('button', { name: 'Edit cargo: Editable crate' }).click()
  const editDialog = page.getByRole('form', { name: 'Edit cargo item' })
  await editDialog.getByLabel('Name', { exact: true }).fill('Cancelled crate')
  await editDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: /Editable crate/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Cancelled crate/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Edit cargo: Editable crate' }).click()
  const reopenedDialog = page.getByRole('form', { name: 'Edit cargo item' })
  await reopenedDialog.getByLabel('Name', { exact: true }).fill('Edited crate')
  await reopenedDialog.getByLabel('Label', { exact: true }).fill('Z')
  await reopenedDialog.getByLabel('Length mm').fill('1100')
  await reopenedDialog.getByLabel('Width mm').fill('800')
  await reopenedDialog.getByLabel('Height mm').fill('550')
  await reopenedDialog.getByLabel('Weight kg').fill('44')
  await reopenedDialog.getByLabel('Quantity').fill('2')
  await reopenedDialog.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByRole('button', { name: /Edited crate/ }).first()).toBeVisible()
  await expect(page.getByText('1100 x 800 x 550 mm, 44 kg, qty 2')).toBeVisible()
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'Edited crate' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Z' }).first()).toBeVisible()
})

test('supports input-order loading mode for work-step planning', async ({ page }) => {
  await openEnglish(page)
  await page.getByLabel('Loading rules').selectOption('input')
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Mode crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('M')
  await cargoForm.getByLabel('Length mm').fill('1200')
  await cargoForm.getByLabel('Width mm').fill('800')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('42')
  await cargoForm.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await expect(page.getByRole('button', { name: /^1 A/ }).first()).toBeVisible()
})

test('drags cargo order and changes input-order work steps', async ({ page }) => {
  await openEnglish(page)
  await page.getByLabel('Loading rules').selectOption('input')
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Order crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('O')
  await cargoForm.getByLabel('Length mm').fill('900')
  await cargoForm.getByLabel('Width mm').fill('700')
  await cargoForm.getByLabel('Height mm').fill('500')
  await cargoForm.getByLabel('Weight kg').fill('30')
  await cargoForm.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()

  const firstBefore = page.getByTestId('cargo-list-item').first()
  await expect(firstBefore).toContainText('Carton A')
  await page.getByTestId('cargo-list-item').last().dragTo(firstBefore)
  await expect(page.getByTestId('cargo-list-item').first()).toContainText('Order crate')

  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.getByRole('button', { name: /^1 O/ }).first()).toBeVisible()
})

test('selectable loading rules change work-step ordering', async ({ page }) => {
  await openEnglish(page)
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Heavy rule crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('W')
  await cargoForm.getByLabel('Length mm').fill('400')
  await cargoForm.getByLabel('Width mm').fill('400')
  await cargoForm.getByLabel('Height mm').fill('400')
  await cargoForm.getByLabel('Weight kg').fill('500')
  await cargoForm.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByLabel('Loading rules').selectOption('weight')
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await expect(page.getByRole('button', { name: /^1 W/ }).first()).toBeVisible()
})

test('collapses container parameters and loading rules without losing summaries', async ({ page }) => {
  await openEnglish(page)

  const containerPanel = page.getByTestId('container-panel')
  await expect(containerPanel.getByLabel('Container type')).toBeVisible()
  const collapseContainer = containerPanel.getByRole('button', { name: 'Collapse' })
  await collapseContainer.click()
  await expect(containerPanel.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
  await expect(containerPanel.getByText("Container 20'")).toBeVisible()
  await expect(containerPanel.getByLabel('Container type')).toHaveCount(0)
  await containerPanel.getByRole('button', { name: 'Expand' }).click()
  await expect(containerPanel.getByLabel('Container type')).toBeVisible()

  const rulesPanel = page.getByTestId('loading-rules-panel')
  await rulesPanel.getByLabel('Loading rules').selectOption('input')
  const collapseRules = rulesPanel.getByRole('button', { name: 'Collapse' })
  await collapseRules.click()
  await expect(rulesPanel.getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false')
  await expect(rulesPanel.getByText('Input order')).toBeVisible()
  await expect(rulesPanel.getByLabel('Loading rules')).toHaveCount(0)
  await rulesPanel.getByRole('button', { name: 'Expand' }).click()
  await expect(rulesPanel.getByLabel('Loading rules')).toHaveValue('input')
})

test('places report panel below the visual workspace in the two-column layout', async ({ page }) => {
  await openEnglish(page)

  const leftBox = await page.locator('aside').first().boundingBox()
  const visualBox = await page.getByTestId('visual-workspace').boundingBox()
  const reportBox = await page.getByTestId('report-panel').boundingBox()
  const canvasBox = await page.locator('canvas').first().boundingBox()

  expect(leftBox).not.toBeNull()
  expect(visualBox).not.toBeNull()
  expect(reportBox).not.toBeNull()
  expect(canvasBox).not.toBeNull()
  expect(reportBox!.y).toBeGreaterThan(visualBox!.y + visualBox!.height - 5)
  expect(canvasBox!.width).toBeGreaterThan(leftBox!.width * 1.4)
  await expect(page.getByTestId('report-panel').getByRole('button', { name: 'History' })).toHaveCount(0)
})

test('shows label detail and diagnostic result tabs', async ({ page }) => {
  await openEnglish(page)

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('columnheader', { name: 'Label' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Original size' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Actual size' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Step' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Failure reason' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'A' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Carton A' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '400 x 500 x 600' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: '18' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'None' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Diagnostics' }).click()
  await expect(page.getByText('INFO').first()).toBeVisible()
  await expect(page.getByText('Boundary check passed: all placed boxes are inside the effective container.')).toBeVisible()
  await expect(page.getByText('Weight check passed: placed cargo is within the maximum payload.')).toBeVisible()
  await expect(page.getByText('Overlap check passed: placed boxes do not overlap.')).toBeVisible()
  await expect(page.getByText(/Support check (passed|warning):/)).toBeVisible()
  await expect(page.getByText('Stacking check passed: stack capacity and ground-only limits are respected.')).toBeVisible()
  await expect(page.getByText(/Optimization suggestion:/)).toBeVisible()
})

test('shows failure reason in the detail table for unplaced cargo', async ({ page }) => {
  await openEnglish(page)
  await page.getByLabel('Max payload kg').fill('36')
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'Exceeds maximum payload' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '16' })).toBeVisible()
})

test('switches to 2D plan views and keeps labels visible', async ({ page }) => {
  await openEnglish(page)

  await page.getByRole('button', { name: '2D' }).click()
  const plan = page.getByTestId('container-plan-2d')
  await expect(plan).toBeVisible()
  await expect(page.getByRole('button', { name: 'Top', exact: true })).toBeVisible()
  await expect(plan.locator('text').filter({ hasText: 'A' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await expect(page.getByTestId('container-plan-2d')).toBeVisible()
  await page.getByRole('button', { name: 'Side', exact: true }).click()
  await expect(page.getByTestId('container-plan-2d')).toBeVisible()

  const svgDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export view' }).click()
  const svgDownload = await svgDownloadPromise
  expect(svgDownload.suggestedFilename()).toBe('packing-plan-side.svg')

  await page.getByRole('button', { name: '3D' }).click()
  await expect(page.getByTestId('container-scene')).toBeVisible()
  const pngDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export view' }).click()
  const pngDownload = await pngDownloadPromise
  expect(pngDownload.suggestedFilename()).toBe('packing-plan-iso.png')
})

test('exports loading sheet PDF from current loading steps', async ({ page }) => {
  await openEnglish(page)
  const exportButton = page.getByTestId('export-loading-sheet-pdf')
  await expect(exportButton).toBeEnabled()

  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('loading-sheet.pdf')
})

test('downgrades covered all-layer 2D labels while keeping top labels readable', async ({ page }) => {
  await openEnglish(page)

  await page.getByLabel('Container type').selectOption('custom')
  await page.getByLabel('Length mm').first().fill('1200')
  await page.getByLabel('Width mm').first().fill('800')
  await page.getByLabel('Height mm').first().fill('2500')
  await page.getByLabel('Max payload kg').fill('10000')

  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Stacked visual crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('Q')
  await cargoForm.getByLabel('Length mm').fill('400')
  await cargoForm.getByLabel('Width mm').fill('500')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('10')
  await cargoForm.getByLabel('Quantity').fill('4')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByLabel('Loading rules').selectOption('input')
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await page.getByRole('button', { name: '2D' }).click()
  const plan = page.getByTestId('container-plan-2d')
  await expect(plan).toBeVisible()
  await expect(plan.locator('[data-label-mode="compact"]').first()).toBeVisible()
  await expect(plan.locator('[data-label-mode="full"]').first()).toBeVisible()

  await page.getByTestId('report-panel').getByRole('button', { name: /^Layer 1\b/ }).click()
  await expect(plan.locator('[data-label-mode="compact"]')).toHaveCount(0)
})

test('rotates 2D labels using packing orientation metadata', async ({ page }) => {
  await openEnglish(page)
  await page.getByLabel('Container type').selectOption('custom')
  await page.getByLabel('Length mm').first().fill('3000')
  await page.getByLabel('Width mm').first().fill('1000')
  await page.getByLabel('Height mm').first().fill('1000')
  await page.getByLabel('Max payload kg').fill('10000')

  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Rotated label crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('R')
  await cargoForm.getByLabel('Length mm').fill('1000')
  await cargoForm.getByLabel('Width mm').fill('3000')
  await cargoForm.getByLabel('Height mm').fill('1000')
  await cargoForm.getByLabel('Weight kg').fill('10')
  await cargoForm.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByLabel('Loading rules').selectOption('volume')
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await page.getByRole('button', { name: '2D' }).click()

  const rotatedLabel = page.locator('g[data-orientation="WLH"][data-label-rotation="90"] text').filter({ hasText: 'R' }).first()
  await expect(rotatedLabel).toBeVisible()
  await expect(rotatedLabel).toHaveAttribute('transform', /rotate\(90/)
})

test('filters the plan view by cargo label', async ({ page }) => {
  await openEnglish(page)
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Label filtered crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('B')
  await cargoForm.getByLabel('Length mm').fill('1200')
  await cargoForm.getByLabel('Width mm').fill('800')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('42')
  await cargoForm.getByLabel('Quantity').fill('2')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await page.getByRole('button', { name: '2D' }).click()
  await page.getByLabel('Label filter', { exact: true }).selectOption('B')
  await expect(page.locator('rect[aria-label^="A Carton A"]').first().locator('xpath=..')).toHaveAttribute('opacity', '0.18')
  await expect(page.locator('rect[aria-label^="B Label filtered crate"]').first().locator('xpath=..')).toHaveAttribute('opacity', '0.88')

  await page.getByRole('button', { name: '3D' }).click()
  await expect(page.getByTestId('container-scene')).toBeVisible()
  await expectCanvasHasRenderedPixels(page)
})

test('renders an interactive 3D canvas', async ({ page }) => {
  await openEnglish(page)
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-interaction-mode', 'auto')
  await expect(scene).toHaveAttribute('data-controls-enabled', 'true')
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box?.width).toBeGreaterThan(300)
  expect(box?.height).toBeGreaterThan(300)

  if (!box) {
    throw new Error('Canvas bounding box unavailable')
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40)
  await page.mouse.up()
  await page.mouse.wheel(0, -500)
  await expectCanvasHasRenderedPixels(page)
})

test('resizes the 3D canvas with a larger browser viewport', async ({ page }) => {
  await openEnglish(page)
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 760 })
  await page.waitForTimeout(150)
  const compactBox = await canvas.boundingBox()

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.waitForTimeout(200)
  const largeBox = await canvas.boundingBox()
  const backingSize = await canvas.evaluate((node) => ({
    width: (node as HTMLCanvasElement).width,
    height: (node as HTMLCanvasElement).height,
  }))

  expect(compactBox).not.toBeNull()
  expect(largeBox).not.toBeNull()
  expect(largeBox!.width).toBeGreaterThan(compactBox!.width)
  expect(largeBox!.height).toBeGreaterThanOrEqual(compactBox!.height)
  expect(backingSize.width).toBeGreaterThanOrEqual(Math.floor(largeBox!.width))
  expect(backingSize.height).toBeGreaterThanOrEqual(Math.floor(largeBox!.height))
})

test('switches 3D camera views and keeps layer filtering visible', async ({ page }) => {
  await openEnglish(page)

  for (const viewName of ['Top', 'Front', 'Side', 'Iso']) {
    await page.getByRole('button', { name: viewName, exact: true }).click()
    await expect(page.getByRole('button', { name: viewName, exact: true })).toHaveClass(/active/)
    await expectCanvasHasRenderedPixels(page)
  }

  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Layer stack')
  await cargoForm.getByLabel('Label', { exact: true }).fill('L')
  await cargoForm.getByLabel('Length mm').fill('1200')
  await cargoForm.getByLabel('Width mm').fill('1000')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('20')
  await cargoForm.getByLabel('Quantity').fill('80')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await expect(page.getByText('Loading steps')).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Layer 1/ }).first()).toHaveClass(/bg-white/)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Layer 2/ }).first()).toHaveClass(/bg-white/)
  await page.getByRole('button', { name: 'Prev', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Layer 1/ }).first()).toHaveClass(/bg-white/)
  await page.getByRole('button', { name: /^1 L/ }).first().click()
  await expect(page.getByRole('button', { name: /^1 L/ }).first()).toHaveClass(/bg-white/)

  await page.getByRole('button', { name: /Layer 2/ }).first().click()
  await expect(page.getByTestId('container-scene')).toBeVisible()
  await expectCanvasHasRenderedPixels(page)
})

test('keeps 3D labels on all exposed faces across camera views', async ({ page }) => {
  await openEnglish(page)
  await page.getByRole('button', { name: /Delete cargo: Carton A/ }).click()
  await page.getByLabel('Container type').selectOption('custom')
  await page.getByLabel('Length mm').first().fill('1000')
  await page.getByLabel('Width mm').first().fill('1000')
  await page.getByLabel('Height mm').first().fill('1000')
  await page.getByLabel('Max payload kg').fill('10000')

  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Camera label cube')
  await cargoForm.getByLabel('Label', { exact: true }).fill('CL')
  await cargoForm.getByLabel('Length mm').fill('1000')
  await cargoForm.getByLabel('Width mm').fill('1000')
  await cargoForm.getByLabel('Height mm').fill('1000')
  await cargoForm.getByLabel('Weight kg').fill('10')
  await cargoForm.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-face-icons-sample', 'rotate,stack')
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+X/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /-X/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Y/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Z/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /-Z/)

  await page.getByRole('button', { name: 'Front', exact: true }).click()
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Y/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Z/)

  await page.getByRole('button', { name: 'Side', exact: true }).click()
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+X/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Y/)

  await page.getByRole('button', { name: 'Top', exact: true }).click()
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Y/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Z/)
})

test('keeps all-direction labels stable when free camera rotates near top view', async ({ page }) => {
  await openEnglish(page)
  await page.getByRole('button', { name: /Delete cargo: Carton A/ }).click()
  await page.getByLabel('Container type').selectOption('custom')
  await page.getByLabel('Length mm').first().fill('1000')
  await page.getByLabel('Width mm').first().fill('1000')
  await page.getByLabel('Height mm').first().fill('1800')
  await page.getByLabel('Max payload kg').fill('10000')

  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Iso top label cube')
  await cargoForm.getByLabel('Label', { exact: true }).fill('IT')
  await cargoForm.getByLabel('Length mm').fill('1000')
  await cargoForm.getByLabel('Width mm').fill('1000')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('10')
  await cargoForm.getByLabel('Quantity').fill('3')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+X/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Y/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Z/)

  await scene.evaluate((element) => {
    element.setAttribute('data-camera-command', 'near-top')
    element.dispatchEvent(new Event('test-camera-command'))
  })

  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+X/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Y/)
  await expect(scene).toHaveAttribute('data-label-faces-sample', /\+Z/)
})

test('supports Excel import/export affordance and Chinese mode', async ({ page }) => {
  await openEnglish(page)
  await expect(page.getByTestId('import-export-toolbar').getByText('Import XLSX')).toBeVisible()
  await expect(page.getByTestId('import-export-toolbar').getByRole('button', { name: 'Export XLSX' })).toBeVisible()
  const filePath = await createWorkbookFile()
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)
  await expect(page.getByRole('button', { name: 'Import log' })).toHaveClass(/active/)
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 1')).toBeVisible()
  await expect(page.getByTestId('import-log-panel').getByText(/Mapped fields: .*label/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Imported crate/ }).first()).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export XLSX' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('packing-plan.xlsx')

  const exportPath = path.join(os.tmpdir(), `cargo-export-${Date.now()}.xlsx`)
  await download.saveAs(exportPath)
  const exported = XLSX.read(await fs.readFile(exportPath), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(exported.Sheets['Packing Plan'])
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    label: 'D',
    name: 'Imported crate',
    originalLength: 900,
    plannedQuantity: 2,
    placedQuantity: 2,
    unplacedQuantity: 0,
    layer: '1',
    workStep: '1, 2',
    maxStackLayers: 4,
  })
  expect(rows[0]).toHaveProperty('failureReason')

  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.locator('header').getByRole('button', { name: '工作台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '装箱', exact: true })).toBeVisible()
  await expect(page.getByText('分层查看')).toBeVisible()
  await expect(page.getByText('逐层添加货物')).toHaveCount(0)
  await expect(page.getByText(/体积利用率: \d+\.\d%/)).toBeVisible()
  await expect(page.getByText('Imported crate').first()).toBeVisible()
  await expect(page.getByText(/数量 2/)).toBeVisible()
  await page.getByRole('button', { name: '合规与诊断' }).click()
  await expect(page.getByText('边界检查通过：所有已装箱体都在有效货柜内。')).toBeVisible()
})

test('creates an import template from the visible manager and reuses it for Excel import', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createTemplateWorkbookFile()
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await expect(page.getByTestId('import-template-manager')).toBeVisible()
  const templateName = `Template ${Date.now()}`
  await page.getByTestId('import-template-name').fill(templateName)
  await page.getByTestId('template-start-row').fill('2')
  await page.getByTestId('template-default-label').fill('TP')
  await page.getByTestId('template-default-quantity').fill('3')
  await page.getByTestId('map-select-name').selectOption('Goods')
  await page.getByTestId('map-select-length').selectOption('L')
  await page.getByTestId('map-select-width').selectOption('W')
  await page.getByTestId('map-select-height').selectOption('H')
  await page.getByTestId('map-unit-length').selectOption('cm')
  await page.getByTestId('map-unit-width').selectOption('cm')
  await page.getByTestId('map-unit-height').selectOption('cm')
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(templateName)
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.getByTestId('open-template-manager').click()
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await expect(page.getByTestId('import-template-manager')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await page.getByTestId('import-template-select').selectOption({ label: templateName })
  await page.getByTestId('confirm-mapping').click()
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 1')).toBeVisible()
  await expect(page.getByRole('button', { name: /Template only crate/ }).first()).toBeVisible()
  await expect(page.getByText(/800 x 600 x 400 mm/)).toBeVisible()
})

test('creates an import template from top-level template manager and reuses it for Excel import', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createTemplateWorkbookFile()
  const templateName = `Template Manager New ${Date.now()}`

  await page.getByTestId('nav-template-manager').click()
  await expect(page.getByTestId('template-manager-list')).toBeVisible()
  await page.getByTestId('template-manager-new').click()
  await page.getByTestId('template-manager-new-name').fill(templateName)
  await page.getByTestId('template-manager-new-map-name').fill('Goods')
  await page.getByTestId('template-manager-new-map-length').fill('L')
  await page.getByTestId('template-manager-new-map-width').fill('W')
  await page.getByTestId('template-manager-new-map-height').fill('H')
  await page.getByTestId('template-manager-new-save').click()

  const savedRow = page.locator('[data-testid^="template-manager-row-"]:has-text("' + templateName + '")')
  await expect(savedRow).toBeVisible()

  await page.locator('header').getByRole('button', { name: 'Workbench' }).click()
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await page.getByTestId('import-template-select').selectOption({ label: templateName })
  await page.getByTestId('confirm-mapping').click()
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 1')).toBeVisible()
  await expect(page.getByRole('button', { name: /Template only crate/ }).first()).toBeVisible()
  await expect(page.getByText(/80 x 60 x 40 mm/)).toBeVisible()
})

test('renames and deletes import templates from top-level template manager', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createTemplateWorkbookFile()
  const templateName = `Template Manage ${Date.now()}`
  const renamedTemplateName = `${templateName} Renamed`

  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await page.getByTestId('import-template-name').fill(templateName)
  await page.getByTestId('map-select-name').selectOption('Goods')
  await page.getByTestId('map-select-length').selectOption('L')
  await page.getByTestId('map-select-width').selectOption('W')
  await page.getByTestId('map-select-height').selectOption('H')
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(templateName)
  await page.getByRole('button', { name: 'Cancel' }).click()

  await page.getByTestId('nav-template-manager').click()
  await expect(page.getByTestId('template-manager-list')).toBeVisible()
  const savedRow = page.locator('[data-testid^="template-manager-row-"]:has-text("' + templateName + '")')
  await expect(savedRow).toBeVisible()
  const rowTestId = await savedRow.getAttribute('data-testid')
  expect(rowTestId).toBeTruthy()
  const templateId = rowTestId!.replace('template-manager-row-', '')

  await page.getByTestId(`template-manager-edit-${templateId}`).click()
  await page.getByTestId(`template-manager-name-${templateId}`).fill(renamedTemplateName)
  await page.getByTestId(`template-manager-map-length-${templateId}`).fill('W')
  await page.getByTestId(`template-manager-save-${templateId}`).click()
  await expect(page.getByTestId(`template-manager-row-${templateId}`)).toContainText(renamedTemplateName)
  await expect(page.getByTestId(`template-manager-row-${templateId}`)).toContainText('length:W')

  await page.locator('header').getByRole('button', { name: 'Workbench' }).click()
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await page.getByTestId('import-template-select').selectOption({ label: renamedTemplateName })
  await page.getByTestId('confirm-mapping').click()
  await expect(page.getByRole('button', { name: /Template only crate/ }).first()).toBeVisible()
  await expect(page.getByText(/60 x 60 x 40 mm/)).toBeVisible()

  await page.getByTestId('nav-template-manager').click()
  await page.getByTestId(`template-manager-delete-${templateId}`).click()
  await expect(page.getByTestId(`template-manager-row-${templateId}`)).toHaveCount(0)

  await page.locator('header').getByRole('button', { name: 'Workbench' }).click()
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await expect(page.getByTestId('import-template-select').locator('option', { hasText: renamedTemplateName })).toHaveCount(0)
})

test('imports Vietnam irregular workbook through a reusable combined-dimension template', async ({ page }) => {
  test.slow()
  await openEnglish(page)
  const templateName = `Vietnam Sheet ${Date.now()}`

  await page.locator('input[accept*="xlsx"]').setInputFiles(vietnamWorkbookPath())
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await page.getByTestId('import-template-name').fill(templateName)
  await page.getByTestId('template-header-row').fill('2')
  await page.getByTestId('template-start-row').fill('3')
  await page.getByTestId('template-dimension-mode').selectOption('combined')
  await page.getByTestId('template-combined-column').selectOption('外箱尺寸（mm）')
  await page.getByTestId('map-select-label').selectOption('物料代码SKU')
  await page.getByTestId('map-select-name').selectOption('物料名称')
  await page.getByTestId('map-select-weight').selectOption('产品毛重(KG)/箱')
  await page.getByTestId('map-select-quantity').selectOption('箱数')
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(templateName)
  await page.getByTestId('confirm-mapping').click()

  await expect(page.getByTestId('import-log-panel').getByText('Import success: 24')).toBeVisible()
  await expect(page.getByTestId('import-log-panel').getByText(/Skipped non-data rows: 1/)).toBeVisible()
  await expect(page.getByRole('button', { name: /世喜PPSU款新生儿奶瓶-防胀气系列160mL越南版（0-1）/ }).first()).toBeVisible()
  await expect(page.getByText(/TB-C10-EV_v1\.1/).first()).toBeVisible()
  await expect(page.getByText(/530 x 305 x 310 mm/).first()).toBeVisible()
  await expect(page.getByText(/qty 126/).first()).toBeVisible()

  await page.locator('input[accept*="xlsx"]').setInputFiles(vietnamWorkbookPath())
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await page.getByTestId('import-template-select').selectOption({ label: templateName })
  await page.getByTestId('confirm-mapping').click()

  await expect(page.getByTestId('import-log-panel').getByText('Import success: 24')).toBeVisible()
  await expect(page.getByText(/TB-C10-EV_v1\.1/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'TB-C10-EV_v1.1', exact: true })).toBeVisible()
})

test('shows localized failure reasons in Chinese mode', async ({ page }) => {
  await openEnglish(page)
  await page.getByLabel('Max payload kg').fill('36')
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await page.getByRole('button', { name: '中文' }).click()

  await page.getByRole('button', { name: '明细表' }).click()
  await expect(page.getByRole('cell', { name: '超过最大载重' })).toBeVisible()

  await page.getByRole('button', { name: '合规与诊断' }).click()
  await expect(page.getByText('失败原因: 超过最大载重')).toBeVisible()
})

test('imports Chinese centimeter Excel fields with visible conversion warning', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createChineseWorkbookFile()
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)

  await expect(page.getByTestId('cargo-panel')).not.toContainText('Import warning row 2')
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 1')).toBeVisible()
  await expect(page.getByTestId('import-log-panel').getByText('Rows converted from cm: 1')).toBeVisible()
  await expect(page.getByTestId('import-log-panel').getByText(/Import warning row 2/)).toBeVisible()
  await expect(page.getByRole('button', { name: /整托货物/ }).first()).toBeVisible()
  await expect(page.getByText(/900 x 700 x 500 mm/)).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export XLSX' }).click()
  const download = await downloadPromise
  const exportPath = path.join(os.tmpdir(), `cargo-export-zh-${Date.now()}.xlsx`)
  await download.saveAs(exportPath)
  const exported = XLSX.read(await fs.readFile(exportPath), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(exported.Sheets['Packing Plan'])

  expect(rows[0]).toMatchObject({
    label: 'P1',
    name: '整托货物',
    originalLength: 900,
    originalWidth: 700,
    originalHeight: 500,
    plannedQuantity: 2,
  })
})

test('imports the real business workbook fixture into the cargo dataset', async ({ page }) => {
  await openEnglish(page)
  await page.locator('input[accept*="xlsx"]').setInputFiles(realWorkbookPath())

  // The real workbook lacks a standard quantity column, so the mapping modal appears
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await page.getByTestId('confirm-mapping').click()

  await expect(page.getByTestId('import-log-panel').getByText('Import success: 31')).toBeVisible()
  await expect(page.getByTestId('import-log-panel').getByText(/Rows converted from cm: 31/)).toBeVisible()
  await expect(page.getByTestId('cargo-list-item').first()).toBeVisible()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: '1', exact: true }).first()).toBeVisible()
  await expect(page.locator('tr').filter({ hasText: '1250 x 830 x 2500' }).first()).toBeVisible()
})

test('imports CSV cargo rows into the same packing flow', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createCsvFile()
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)

  await expect(page.getByTestId('import-log-panel').getByText('Import success: 1')).toBeVisible()
  await expect(page.getByRole('button', { name: /CSV crate/ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'C', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'CSV crate' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1100 x 750 x 550' }).first()).toBeVisible()
})

test('shows a clear import issue for workbooks without usable rows', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createEmptyWorkbookFile()
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)

  await expect(page.getByTestId('import-log-panel').getByText('Import issue: No usable data found')).toBeVisible()
})

test('saves and restores history plans with labels and layers intact', async ({ page }) => {
  await openEnglish(page)
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('History crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('H')
  await cargoForm.getByLabel('Length mm').fill('1200')
  await cargoForm.getByLabel('Width mm').fill('800')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('42')
  await cargoForm.getByLabel('Quantity').fill('3')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load', exact: true }).click()

  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByTestId('history-page').getByText(/H:3\/3/).first()).toBeVisible()

  await page.getByRole('button', { name: 'Back to workbench' }).click()
  const filePath = await createWorkbookFile()
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)
  await expect(page.getByTestId('cargo-list-item').filter({ hasText: 'Imported crate' })).toBeVisible()

  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'Restore' }).first().click()
  await expect(page.getByText('1200 x 800 x 600 mm, 42 kg, qty 3')).toBeVisible()

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'H', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'History crate' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1' }).first()).toBeVisible()
})

test('keeps history on an independent page with the latest five local plans', async ({ page }) => {
  await openEnglish(page)

  for (let index = 1; index <= 6; index += 1) {
    await page.getByLabel('Shipment name').fill(`History ${index}`)
    await page.getByRole('button', { name: 'History', exact: true }).click()
    await expect(page.getByTestId('history-page')).toBeVisible()
    await page.getByRole('button', { name: 'Save plan' }).click()
    await expect(page.getByText(`Shipment: History ${index}`)).toBeVisible()
    if (index < 6) {
      await page.getByRole('button', { name: 'Back to workbench' }).click()
    }
  }

  await expect(page.getByText('Shipment: History 1')).toHaveCount(0)
  for (let index = 2; index <= 6; index += 1) {
    await expect(page.getByText(`Shipment: History ${index}`)).toBeVisible()
  }

  await page.getByRole('button', { name: 'Restore' }).first().click()
  await expect(page.getByLabel('Shipment name')).toHaveValue('History 6')
  await expect(page.getByTestId('history-page')).toHaveCount(0)
})
