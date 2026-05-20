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

async function createCsvFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-calc-csv-'))
  const filePath = path.join(dir, 'cargo-import.csv')
  await fs.writeFile(
    filePath,
    [
      'label,name,length,width,height,weight,quantity,color,canRotate,stackable',
      'C,CSV crate,1100,750,550,40,2,#654321,true,false',
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

test('loads the container calculator workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Shipments & Reports')).toBeVisible()
  await expect(page.getByText('Pallet / cargo unit parameters')).toBeVisible()
  await expect(page.getByText('Loading rules')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Users' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Licenses' })).toHaveCount(0)
  await expect(page.getByTestId('container-scene')).toBeVisible()
})

test('updates parameters when selecting another container', async ({ page }) => {
  await page.goto('/')
  const target = page.getByRole('button', { name: /Container 45' HC/ }).first()
  await target.click()
  await expect(target).toHaveClass(/bg-white/)
})

test('shows custom container fields and effective dimensions', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Container type').selectOption('custom')
  await page.getByLabel('Length mm').first().fill('15000')
  await page.getByLabel('Width mm').first().fill('2400')
  await page.getByLabel('Height mm').first().fill('2600')
  await page.getByLabel('Max payload kg').fill('28000')
  await page.getByLabel('Door gap mm').fill('300')
  await page.getByLabel('Top gap mm').fill('100')
  await page.getByLabel('Side gap mm').fill('50')

  await expect(page.getByText('14,700 x 2,300 x 2,500 mm')).toBeVisible()
})

test('adds cargo and recalculates utilization', async ({ page }) => {
  await page.goto('/')
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Tall crate')
  await cargoForm.getByLabel('Length mm').fill('1200')
  await cargoForm.getByLabel('Width mm').fill('800')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('42')
  await cargoForm.getByLabel('Quantity').fill('3')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load' }).click()

  await expect(page.getByRole('button', { name: /Tall crate/ }).first()).toBeVisible()
  await expect(page.getByText(/Volume utilization: \d+\.\d%/)).toBeVisible()
  await expect(page.getByText(/Weight utilization: \d+\.\d%/)).toBeVisible()
  await expect(page.getByText('Cargo types: 2')).toBeVisible()
  await expect(page.getByText('Layer-by-layer placement')).toBeVisible()
})

test('supports input-order loading mode for work-step planning', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Loading mode').selectOption('input')
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Mode crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('M')
  await cargoForm.getByLabel('Length mm').fill('1200')
  await cargoForm.getByLabel('Width mm').fill('800')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('42')
  await cargoForm.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load' }).click()

  await expect(page.getByRole('button', { name: /^1 A/ }).first()).toBeVisible()
})

test('shows label detail and diagnostic result tabs', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('columnheader', { name: 'Label' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Original size' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Actual size' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Step' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Failure reason' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'A' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Carton A' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '600 x 400 x 350' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: '18' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'None' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Diagnostics' }).click()
  await expect(page.getByText('INFO').first()).toBeVisible()
  await expect(page.getByText('Boundary check passed: all placed boxes are inside the effective container.')).toBeVisible()
  await expect(page.getByText('Weight check passed: placed cargo is within the maximum payload.')).toBeVisible()
  await expect(page.getByText('Overlap check passed: placed boxes do not overlap.')).toBeVisible()
  await expect(page.getByText('Support check passed: stacked boxes have explicit support relationships.')).toBeVisible()
  await expect(page.getByText('Stacking check passed: non-stackable items are not used as supports.')).toBeVisible()
  await expect(page.getByText(/Optimization suggestion:/)).toBeVisible()
})

test('shows failure reason in the detail table for unplaced cargo', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Max payload kg').fill('36')
  await page.getByRole('button', { name: 'Load' }).click()

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'Exceeds maximum payload' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '16' })).toBeVisible()
})

test('switches to 2D plan views and keeps labels visible', async ({ page }) => {
  await page.goto('/')

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

test('filters the plan view by cargo label', async ({ page }) => {
  await page.goto('/')
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('Label filtered crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('B')
  await cargoForm.getByLabel('Length mm').fill('1200')
  await cargoForm.getByLabel('Width mm').fill('800')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('42')
  await cargoForm.getByLabel('Quantity').fill('2')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load' }).click()

  await page.getByRole('button', { name: '2D' }).click()
  await page.getByLabel('Label filter', { exact: true }).selectOption('B')
  await expect(page.locator('rect[aria-label^="A Carton A"]').first().locator('xpath=..')).toHaveAttribute('opacity', '0.18')
  await expect(page.locator('rect[aria-label^="B Label filtered crate"]').first().locator('xpath=..')).toHaveAttribute('opacity', '0.88')

  await page.getByRole('button', { name: '3D' }).click()
  await expect(page.getByTestId('container-scene')).toBeVisible()
  await expectCanvasHasRenderedPixels(page)
})

test('renders an interactive 3D canvas', async ({ page }) => {
  await page.goto('/')
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
  await expectCanvasHasRenderedPixels(page)
})

test('switches 3D camera views and keeps layer filtering visible', async ({ page }) => {
  await page.goto('/')

  for (const viewName of ['Top', 'Front', 'Side', 'Iso']) {
    await page.getByRole('button', { name: viewName, exact: true }).click()
    await expect(page.getByRole('button', { name: viewName, exact: true })).toHaveClass(/bg-white/)
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
  await page.getByRole('button', { name: 'Load' }).click()

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

test('supports Excel import/export affordance and Chinese mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Import XLSX')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export XLSX' })).toBeVisible()
  const filePath = await createWorkbookFile()
  await page.locator('input[type="file"]').setInputFiles(filePath)
  await expect(page.getByText('Import success: 1')).toBeVisible()
  await expect(page.getByText(/Mapped fields: .*label/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Imported crate/ }).first()).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export XLSX' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('packing-plan.xlsx')

  const exportPath = path.join(os.tmpdir(), `cargo-export-${Date.now()}.xlsx`)
  await download.saveAs(exportPath)
  const exported = XLSX.read(await fs.readFile(exportPath), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(exported.Sheets[exported.SheetNames[0]])
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
  })
  expect(rows[0]).toHaveProperty('failureReason')

  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('button', { name: '货物项目' })).toBeVisible()
  await expect(page.getByRole('button', { name: '装箱', exact: true })).toBeVisible()
  await expect(page.getByText('逐层添加货物')).toBeVisible()
  await expect(page.getByText(/体积利用率: \d+\.\d%/)).toBeVisible()
  await expect(page.getByText('Imported crate').first()).toBeVisible()
  await expect(page.getByText(/数量 2/)).toBeVisible()
  await page.getByRole('button', { name: '合规与诊断' }).click()
  await expect(page.getByText('边界检查通过：所有已装箱体都在有效货柜内。')).toBeVisible()
})

test('shows localized failure reasons in Chinese mode', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Max payload kg').fill('36')
  await page.getByRole('button', { name: 'Load' }).click()
  await page.getByRole('button', { name: '中文' }).click()

  await page.getByRole('button', { name: '明细表' }).click()
  await expect(page.getByRole('cell', { name: '超过最大载重' })).toBeVisible()

  await page.getByRole('button', { name: '合规与诊断' }).click()
  await expect(page.getByText('失败原因: 超过最大载重')).toBeVisible()
})

test('imports Chinese centimeter Excel fields with visible conversion warning', async ({ page }) => {
  await page.goto('/')
  const filePath = await createChineseWorkbookFile()
  await page.locator('input[type="file"]').setInputFiles(filePath)

  await expect(page.getByText('Import success: 1')).toBeVisible()
  await expect(page.getByText('Rows converted from cm: 1')).toBeVisible()
  await expect(page.getByText(/Import warning row 2/)).toBeVisible()
  await expect(page.getByRole('button', { name: /整托货物/ }).first()).toBeVisible()
  await expect(page.getByText(/900 x 700 x 500 mm/)).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export XLSX' }).click()
  const download = await downloadPromise
  const exportPath = path.join(os.tmpdir(), `cargo-export-zh-${Date.now()}.xlsx`)
  await download.saveAs(exportPath)
  const exported = XLSX.read(await fs.readFile(exportPath), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(exported.Sheets[exported.SheetNames[0]])

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
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles(realWorkbookPath())

  await expect(page.getByText('Import success: 31')).toBeVisible()
  await expect(page.getByText(/Rows converted from cm: 31/)).toBeVisible()
  await expect(page.getByRole('button', { name: /1 Cargo 1/ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Load' }).click()

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: '1', exact: true }).first()).toBeVisible()
  await expect(page.locator('tr').filter({ hasText: '1250 x 830 x 2500' }).first()).toBeVisible()
})

test('imports CSV cargo rows into the same packing flow', async ({ page }) => {
  await page.goto('/')
  const filePath = await createCsvFile()
  await page.locator('input[type="file"]').setInputFiles(filePath)

  await expect(page.getByText('Import success: 1')).toBeVisible()
  await expect(page.getByRole('button', { name: /CSV crate/ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Load' }).click()

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'C', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'CSV crate' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1100 x 750 x 550' }).first()).toBeVisible()
})

test('shows a clear import issue for workbooks without usable rows', async ({ page }) => {
  await page.goto('/')
  const filePath = await createEmptyWorkbookFile()
  await page.locator('input[type="file"]').setInputFiles(filePath)

  await expect(page.getByText('Import issue: No usable data found')).toBeVisible()
})

test('saves and restores history plans with labels and layers intact', async ({ page }) => {
  await page.goto('/')
  const cargoForm = page.locator('form')
  await cargoForm.getByLabel('Name', { exact: true }).fill('History crate')
  await cargoForm.getByLabel('Label', { exact: true }).fill('H')
  await cargoForm.getByLabel('Length mm').fill('1200')
  await cargoForm.getByLabel('Width mm').fill('800')
  await cargoForm.getByLabel('Height mm').fill('600')
  await cargoForm.getByLabel('Weight kg').fill('42')
  await cargoForm.getByLabel('Quantity').fill('3')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load' }).click()

  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText(/H:3\/3/)).toBeVisible()

  const filePath = await createWorkbookFile()
  await page.locator('input[type="file"]').setInputFiles(filePath)
  await expect(page.getByRole('button', { name: /Imported crate/ })).toBeVisible()

  await page.getByRole('button', { name: 'History', exact: true }).click()
  await page.getByRole('button', { name: 'Restore' }).first().click()
  await expect(page.getByText('1200 x 800 x 600 mm, 42 kg, qty 3')).toBeVisible()

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('cell', { name: 'H', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'History crate' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '1' }).first()).toBeVisible()
})
