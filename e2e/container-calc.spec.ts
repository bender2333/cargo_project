import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
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

test('loads the container calculator workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Shipments & Reports')).toBeVisible()
  await expect(page.getByTestId('container-scene')).toBeVisible()
})

test('updates parameters when selecting another container', async ({ page }) => {
  await page.goto('/')
  const target = page.getByRole('button', { name: /Container 40' HC/ }).first()
  await target.click()
  await expect(target).toHaveClass(/bg-white/)
})

test('adds cargo and recalculates utilization', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Name', { exact: true }).fill('Tall crate')
  await page.getByLabel('Length mm').fill('1200')
  await page.getByLabel('Width mm').fill('800')
  await page.getByLabel('Height mm').fill('600')
  await page.getByLabel('Weight kg').fill('42')
  await page.getByLabel('Quantity').fill('3')
  await page.getByRole('button', { name: '+ Add cargo item' }).click()
  await page.getByRole('button', { name: 'Load' }).click()

  await expect(page.getByRole('button', { name: /Tall crate/ }).first()).toBeVisible()
  await expect(page.getByText(/Volume utilization: \d+\.\d%/)).toBeVisible()
  await expect(page.getByText(/Weight utilization: \d+\.\d%/)).toBeVisible()
  await expect(page.getByText('Layer-by-layer placement')).toBeVisible()
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
  expect(download.suggestedFilename()).toBe('cargo-items.xlsx')

  const exportPath = path.join(os.tmpdir(), `cargo-export-${Date.now()}.xlsx`)
  await download.saveAs(exportPath)
  const exported = XLSX.read(await fs.readFile(exportPath), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(exported.Sheets[exported.SheetNames[0]])
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ label: 'D', name: 'Imported crate', length: 900, quantity: 2 })

  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('button', { name: '货物项目' })).toBeVisible()
  await expect(page.getByRole('button', { name: '装箱', exact: true })).toBeVisible()
  await expect(page.getByText('逐层添加货物')).toBeVisible()
  await expect(page.getByText(/体积利用率: \d+\.\d%/)).toBeVisible()
  await expect(page.getByText('Imported crate')).toBeVisible()
  await expect(page.getByText(/数量 2/)).toBeVisible()
})
