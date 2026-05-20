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
  await expect(page.getByText('Layer-by-layer placement')).toBeVisible()
})

test('shows label detail and diagnostic result tabs', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Details' }).click()
  await expect(page.getByRole('columnheader', { name: 'Label' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'A' }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Carton A' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '18' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Diagnostics' }).click()
  await expect(page.getByText('INFO')).toBeVisible()
  await expect(page.getByText('Calculated packing satisfies boundary, weight, overlap, and stacking checks.')).toBeVisible()
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

  await page.getByRole('button', { name: '3D' }).click()
  await expect(page.getByTestId('container-scene')).toBeVisible()
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
  await expect(page.getByRole('button', { name: /Imported crate/ })).toBeVisible()

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
  await expect(page.getByText('Imported crate')).toBeVisible()
  await expect(page.getByText(/数量 2/)).toBeVisible()
})

test('imports Chinese centimeter Excel fields with visible conversion warning', async ({ page }) => {
  await page.goto('/')
  const filePath = await createChineseWorkbookFile()
  await page.locator('input[type="file"]').setInputFiles(filePath)

  await expect(page.getByText(/Import warning row 2/)).toBeVisible()
  await expect(page.getByRole('button', { name: /整托货物/ })).toBeVisible()
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
