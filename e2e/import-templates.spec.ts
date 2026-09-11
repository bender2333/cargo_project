import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import * as XLSX from 'xlsx'
import { e2eCredentials } from './credentials'

function uniqueName(suffix: string) {
  return `e2e-t7-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

function realWorkbookPath() {
  return path.join(process.cwd(), 'test-data', 'excel', '俄罗斯整托装柜尺寸.xlsx')
}

function vietnamWorkbookPath() {
  return path.join(process.cwd(), 'test-data', 'excel', '越南第十一批6.2海运.xlsx')
}

async function writeWorkbook(rows: Array<Record<string, string | number>>, fileName: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cargo-t7-'))
  const filePath = path.join(dir, fileName)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Cargo')
  XLSX.writeFile(workbook, filePath)
  return filePath
}

async function createMappedWorkbook() {
  return writeWorkbook([{
    Goods: 'Template only crate',
    Code: 'TP',
    L: 80,
    W: 60,
    H: 40,
    Weight: 20,
  }], 'template-cargo.xlsx')
}

async function createMissingLengthWorkbook() {
  return writeWorkbook([{
    Goods: 'Missing length crate',
    Code: 'ML',
    W: 60,
    H: 40,
    Qty: 2,
  }], 'missing-length.xlsx')
}

async function createWeightlessWorkbook() {
  return writeWorkbook([{
    Name: 'No weight crate',
    L: 900,
    W: 700,
    H: 500,
    Qty: 2,
  }], 'no-weight.xlsx')
}

async function createInvalidWeightWorkbook(weight: string | number) {
  return writeWorkbook([{
    Name: 'Bad weight crate',
    L: 900,
    W: 700,
    H: 500,
    Weight: weight,
    Qty: 1,
  }], 'bad-weight.xlsx')
}

async function openEnglish(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'English' }).click()
}

async function openImport(page: Page, filePath: string) {
  await page.locator('input[accept*="xlsx"]').setInputFiles(filePath)
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await expect(page.getByTestId('template-selection-panel')).toBeVisible()
}

async function useWithoutTemplate(page: Page) {
  await page.getByTestId('use-without-template').click()
  await expect(page.getByTestId('mapping-preview')).toBeVisible()
  await expect(page.getByTestId('map-select-length')).toHaveValue('')
  await expect(page.getByTestId('mapping-required-length')).toBeVisible()
}

async function mapColumns(page: Page, mapping: Record<string, string>) {
  for (const [field, column] of Object.entries(mapping)) {
    await page.getByTestId(`map-select-${field}`).selectOption(column)
  }
}

async function setCmUnits(page: Page) {
  await page.getByTestId('map-unit-length').selectOption('cm')
  await page.getByTestId('map-unit-width').selectOption('cm')
  await page.getByTestId('map-unit-height').selectOption('cm')
}

async function selectTemplateByName(page: Page, name: string) {
  await page.getByTestId('template-selection-panel').getByRole('button', { name, exact: true }).click()
  await expect(page.getByTestId('mapping-preview')).toBeVisible()
}

async function templateSelectionId(page: Page, name: string) {
  const testId = await page.getByTestId('template-selection-panel').getByRole('button', { name, exact: true }).getAttribute('data-testid')
  expect(testId).toBeTruthy()
  return testId!.replace('template-selection-item-', '')
}

async function cancelImport(page: Page) {
  await page.getByTestId('mapping-modal').getByRole('button', { name: /^(Cancel|取消)$/ }).click()
  await expect(page.getByTestId('mapping-modal')).toHaveCount(0)
}

async function goToWorkbench(page: Page) {
  await page.locator('header').getByRole('button', { name: /Workbench|工作台/ }).click()
}

async function deleteTemplatesByName(page: Page, names: string[]) {
  await page.getByTestId('nav-template-manager').click()
  await expect(page.getByTestId('template-manager-list')).toBeVisible()
  for (const name of names) {
    const row = page.locator('[data-testid^="template-manager-row-"]', { hasText: name })
    if (await row.count() === 0) continue
    const rowTestId = await row.getAttribute('data-testid')
    expect(rowTestId).toBeTruthy()
    const id = rowTestId!.replace('template-manager-row-', '')
    await page.getByTestId(`template-manager-delete-${id}`).click()
    await expect(page.getByTestId(`template-manager-row-${id}`)).toHaveCount(0)
  }
  await goToWorkbench(page)
}

async function waitTwoAnimationFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

async function aimSceneNearTop(page: Page) {
  const scene = page.getByTestId('container-scene')
  await scene.evaluate((element) => {
    element.setAttribute('data-camera-command', 'near-top')
    element.dispatchEvent(new Event('test-camera-command'))
  })
  await waitTwoAnimationFrames(page)
}

async function poolRemainingTotal(page: Page) {
  return page.getByTestId('manual-pool-item').evaluateAll((elements) => (
    elements.reduce((sum, element) => sum + Number(element.getAttribute('data-remaining') ?? 0), 0)
  ))
}

/** Select an actual rendered box, rather than dispatching a synthetic 2D event. */
async function selectBoxBy3dCanvasHit(page: Page) {
  const scene = page.getByTestId('container-scene')
  const canvas = scene.locator('canvas')
  await expect(canvas).toBeVisible()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('3D canvas has no bounding box')

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      await aimSceneNearTop(page)
      await canvas.click({
        position: {
          x: bounds.width * (0.22 + (0.56 * column) / 5),
          y: bounds.height * (0.28 + (0.52 * row) / 3),
        },
      })
      if (await scene.getAttribute('data-selected-orientation')) return
    }
  }
  throw new Error('3D canvas pointer hit did not select a box')
}

const templateMapping = {
  name: 'Goods',
  length: 'L',
  width: 'W',
  height: 'H',
  weight: 'Weight',
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  if (await page.locator('#username').isVisible()) {
    await page.fill('#username', e2eCredentials.user.username)
    await page.fill('#password', e2eCredentials.user.password)
    await page.click('button[type="submit"]')
    await expect(page.getByTestId('report-panel')).toBeVisible()
    await page.evaluate(async () => {
      const token = window.localStorage.getItem('cargo_token')
      if (!token) return
      await fetch('/api/history', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    })
  }
})

test('A/B: parsed file opens template selection then blank required mapping', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createMappedWorkbook()
  await expect(page.getByRole('button', { name: /Carton A/ }).first()).toBeVisible()
  await openImport(page, filePath)
  await expect(page.getByTestId('use-without-template')).toBeVisible()
  await expect(page.getByTestId('mapping-preview')).toHaveCount(0)
  await expect(page.getByTestId('import-log-panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Template only crate/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Carton A/ }).first()).toBeVisible()

  await useWithoutTemplate(page)
  await expect(page.getByTestId('map-select-width')).toHaveValue('')
  await expect(page.getByTestId('map-select-height')).toHaveValue('')
  await expect(page.getByTestId('map-select-weight')).toHaveValue('')
  await expect(page.getByTestId('mapping-required-width')).toBeVisible()
  await expect(page.getByTestId('mapping-required-height')).toBeVisible()
  await expect(page.getByText('* marks fields required to complete the current configuration')).toBeVisible()
  await mapColumns(page, { length: 'L', width: 'W', height: 'H' })
  await expect(page.getByTestId('mapping-parse-summary')).toContainText(/ok/)
})

test('C: mapping and preview stay editable after a valid mapping', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createMappedWorkbook()
  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await mapColumns(page, templateMapping)
  await setCmUnits(page)
  await expect(page.getByTestId('mapping-fields')).toBeVisible()
  await expect(page.getByTestId('mapping-preview')).toBeVisible()
  await expect(page.getByTestId('map-select-length')).toBeEnabled()
  await expect(page.getByTestId('confirm-mapping')).toBeEnabled()
  await page.getByTestId('template-selection-back').click()
  await expect(page.getByTestId('template-selection-panel')).toBeVisible()
  await expect(page.getByTestId('mapping-preview')).toHaveCount(0)
})

test('D: unmapped and blank weight become internal 1 kg without a warning', async ({ page }) => {
  await openEnglish(page)
  const unmappedPath = await createWeightlessWorkbook()
  await openImport(page, unmappedPath)
  await useWithoutTemplate(page)
  await mapColumns(page, { name: 'Name', length: 'L', width: 'W', height: 'H', quantity: 'Qty' })
  await expect(page.getByTestId('template-default-weight')).toHaveCount(0)
  await expect(page.getByTestId('mapping-parse-summary')).toContainText('1 kg')
  await expect(page.getByTestId('mapping-parse-summary')).not.toContainText(/invalid-weight|default weight|默认重量/i)
  await expect(page.getByTestId('confirm-mapping')).toBeEnabled()
  await page.getByTestId('confirm-mapping').click()
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 1')).toBeVisible()
  await expect(page.getByTestId('cargo-list-item').filter({ hasText: 'No weight crate' })).toContainText('1 kg')
  await expect(page.getByTestId('import-log-panel')).not.toContainText(/default weight|默认重量/i)

  const blankPath = await writeWorkbook([{
    Name: 'Blank weight crate',
    L: 900,
    W: 700,
    H: 500,
    Weight: '',
    Qty: 1,
  }], 'blank-weight.xlsx')
  await openImport(page, blankPath)
  await useWithoutTemplate(page)
  await mapColumns(page, { name: 'Name', length: 'L', width: 'W', height: 'H', weight: 'Weight', quantity: 'Qty' })
  await expect(page.getByTestId('confirm-mapping')).toBeEnabled()
  await page.getByTestId('confirm-mapping').click()
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 1')).toBeVisible()
  await expect(page.getByTestId('cargo-list-item').filter({ hasText: 'Blank weight crate' })).toContainText('1 kg')
})

test('E: non-empty invalid weight blocks the whole batch', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createInvalidWeightWorkbook(-1)
  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await mapColumns(page, { name: 'Name', length: 'L', width: 'W', height: 'H', weight: 'Weight', quantity: 'Qty' })
  await expect(page.getByTestId('mapping-parse-summary')).toContainText('0 ok')
  await expect(page.getByTestId('mapping-error-hint')).toBeVisible()
  await expect(page.getByTestId('confirm-mapping')).toBeDisabled()
  await expect(page.getByRole('button', { name: /Bad weight crate/ })).toHaveCount(0)
})


test('F: saving a no-template mapping does not import cargo', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createMappedWorkbook()
  const templateName = uniqueName('save')
  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await mapColumns(page, templateMapping)
  await setCmUnits(page)
  await page.getByTestId('import-template-name').fill(templateName)
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(templateName)
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await expect(page.getByTestId('confirm-mapping')).toBeVisible()
  await expect(page.getByRole('button', { name: /Template only crate/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Carton A/ }).first()).toBeVisible()
  await cancelImport(page)
  await deleteTemplatesByName(page, [templateName])
})

test('G: update keeps the original template id and does not import', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createMappedWorkbook()
  const templateName = uniqueName('update')
  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await mapColumns(page, templateMapping)
  await setCmUnits(page)
  await page.getByTestId('import-template-name').fill(templateName)
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(templateName)
  await cancelImport(page)

  await openImport(page, filePath)
  const originalId = await templateSelectionId(page, templateName)
  await selectTemplateByName(page, templateName)
  await expect(page.getByTestId('map-select-name')).toHaveValue('Goods')
  await page.getByTestId('map-select-name').selectOption('Code')
  await page.getByTestId('update-import-template').click()
  await expect(page.getByTestId('template-save-status')).toBeVisible()
  await expect(page.getByTestId('mapping-modal')).toBeVisible()
  await expect(page.getByRole('button', { name: /Template only crate/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Carton A/ }).first()).toBeVisible()
  await cancelImport(page)

  await openImport(page, filePath)
  expect(await templateSelectionId(page, templateName)).toBe(originalId)
  await selectTemplateByName(page, templateName)
  await expect(page.getByTestId('map-select-name')).toHaveValue('Code')
  await expect(page.getByTestId('selected-import-template-name')).toHaveText(templateName)
  await cancelImport(page)
  await deleteTemplatesByName(page, [templateName])
})

test('H: save-as creates a new template and keeps the original', async ({ page }) => {
  test.setTimeout(60_000)
  await openEnglish(page)
  const filePath = await createMappedWorkbook()
  const originalName = uniqueName('copy-src')
  const otherName = uniqueName('copy-other')
  const copyName = uniqueName('copy-dst')

  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await mapColumns(page, templateMapping)
  await setCmUnits(page)
  await page.getByTestId('import-template-name').fill(originalName)
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(originalName)
  await cancelImport(page)

  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await mapColumns(page, templateMapping)
  await setCmUnits(page)
  await page.getByTestId('import-template-name').fill(otherName)
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(otherName)
  await cancelImport(page)

  await openImport(page, filePath)
  const originalId = await templateSelectionId(page, originalName)
  await selectTemplateByName(page, originalName)
  await page.getByTestId('map-select-name').selectOption('Code')
  await page.getByTestId('import-template-save-as-name').fill('')
  await page.getByTestId('save-as-import-template').click()
  await expect(page.getByTestId('template-write-error')).toContainText(/Enter a template name|请输入模板名称/)
  await page.getByTestId('import-template-save-as-name').fill(originalName)
  await page.getByTestId('save-as-import-template').click()
  await expect(page.getByTestId('template-write-error')).toContainText(/different unique name|不同且唯一/)
  await page.getByTestId('import-template-save-as-name').fill(otherName)
  await page.getByTestId('save-as-import-template').click()
  await expect(page.getByTestId('template-write-error')).toContainText(/already exists|已存在/)
  await page.getByTestId('import-template-save-as-name').fill(copyName)
  await page.getByTestId('save-as-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(copyName)
  await expect(page.getByRole('button', { name: /Template only crate/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Carton A/ }).first()).toBeVisible()
  await cancelImport(page)

  await openImport(page, filePath)
  expect(await templateSelectionId(page, originalName)).toBe(originalId)
  await selectTemplateByName(page, originalName)
  await expect(page.getByTestId('map-select-name')).toHaveValue('Goods')
  await page.getByTestId('template-selection-back').click()
  await selectTemplateByName(page, copyName)
  await expect(page.getByTestId('map-select-name')).toHaveValue('Code')
  await expect(page.getByRole('button', { name: /Carton A/ }).first()).toBeVisible()
  await cancelImport(page)
  await deleteTemplatesByName(page, [originalName, otherName, copyName])
})

test('I: incomplete or duplicate mapping cannot be saved', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createMappedWorkbook()
  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await page.getByTestId('import-template-name').fill(uniqueName('invalid'))
  await expect(page.getByTestId('mapping-required-length')).toBeVisible()
  await expect(page.getByTestId('mapping-missing-hint')).toBeVisible()
  await expect(page.getByTestId('save-import-template')).toBeDisabled()
  await mapColumns(page, { length: 'L', width: 'L', height: 'H' })
  await expect(page.getByTestId('map-select-length')).toHaveAttribute('data-invalid', 'true')
  await expect(page.getByTestId('map-select-width')).toHaveAttribute('data-invalid', 'true')
  await expect(page.getByTestId('save-import-template')).toBeDisabled()
  await cancelImport(page)
})

test('J: missing template columns stay selected and block confirm and writes', async ({ page }) => {
  await openEnglish(page)
  const filePath = await createMappedWorkbook()
  const templateName = uniqueName('missing')
  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await mapColumns(page, templateMapping)
  await setCmUnits(page)
  await page.getByTestId('import-template-name').fill(templateName)
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(templateName)
  await cancelImport(page)

  const missingPath = await createMissingLengthWorkbook()
  await openImport(page, missingPath)
  await selectTemplateByName(page, templateName)
  await expect(page.getByTestId('selected-import-template-name')).toHaveText(templateName)
  await expect(page.getByTestId('map-select-length')).toHaveAttribute('data-invalid', 'true')
  await expect(page.getByText(/Column not found in file/).first()).toBeVisible()
  await expect(page.getByTestId('confirm-mapping')).toBeDisabled()
  await page.getByTestId('map-unit-width').selectOption('mm')
  await expect(page.getByTestId('update-import-template')).toBeDisabled()
  await expect(page.getByTestId('save-as-import-template')).toBeDisabled()
  await expect(page.getByRole('button', { name: /Missing length crate/ })).toHaveCount(0)
  await cancelImport(page)
  await deleteTemplatesByName(page, [templateName])
})

test('K: cancel leaves cargo and packing results unchanged', async ({ page }) => {
  await openEnglish(page)
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.getByText(/Loaded: 18 \/ 18/)).toBeVisible()
  const filePath = await createMappedWorkbook()
  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await mapColumns(page, templateMapping)
  await cancelImport(page)
  await expect(page.getByRole('button', { name: /Carton A/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Template only crate/ })).toHaveCount(0)
  await expect(page.getByText(/Loaded: 18 \/ 18/)).toBeVisible()
  await expect(page.getByTestId('import-log-panel')).toHaveCount(0)
})

test('L: confirm import replaces the current cargo list without a second prompt', async ({ page }) => {
  await openEnglish(page)
  await expect(page.getByRole('button', { name: /Carton A/ }).first()).toBeVisible()
  const filePath = await createMappedWorkbook()
  await openImport(page, filePath)
  await useWithoutTemplate(page)
  await mapColumns(page, templateMapping)
  await setCmUnits(page)
  await expect(page.getByRole('button', { name: /replace|追加|二次/i })).toHaveCount(0)
  await page.getByTestId('confirm-mapping').click()
  await expect(page.getByTestId('mapping-modal')).toHaveCount(0)
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 1')).toBeVisible()
  await expect(page.getByRole('button', { name: /Template only crate/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Carton A/ })).toHaveCount(0)
})

test('M: template manager CRUD does not open import or change cargo', async ({ page }) => {
  await openEnglish(page)
  const templateName = uniqueName('manager')
  const renamed = `${templateName} renamed`
  await page.getByTestId('nav-template-manager').click()
  await expect(page.getByTestId('template-manager-list')).toBeVisible()
  await expect(page.getByTestId('mapping-modal')).toHaveCount(0)
  await page.getByTestId('template-manager-new').click()
  await page.getByTestId('template-manager-new-name').fill(templateName)
  await page.getByTestId('tm-new-map-select-name').fill('Goods')
  await page.getByTestId('tm-new-map-select-length').fill('L')
  await page.getByTestId('tm-new-map-select-width').fill('W')
  await page.getByTestId('tm-new-map-select-height').fill('H')
  await page.getByTestId('template-manager-new-save').click()
  const savedRow = page.locator('[data-testid^="template-manager-row-"]', { hasText: templateName })
  await expect(savedRow).toBeVisible()
  const rowTestId = await savedRow.getAttribute('data-testid')
  const templateId = rowTestId!.replace('template-manager-row-', '')
  await page.getByTestId(`template-manager-edit-${templateId}`).click()
  await page.getByTestId(`template-manager-name-${templateId}`).fill(renamed)
  await page.getByTestId(`template-manager-save-${templateId}`).click()
  await expect(page.getByTestId(`template-manager-row-${templateId}`)).toContainText(renamed)
  await page.getByTestId('template-manager-sample-input').setInputFiles(await createMappedWorkbook())
  await expect(page.getByTestId('template-manager-sample-status')).toBeVisible()
  await expect(page.getByTestId('mapping-modal')).toHaveCount(0)
  await goToWorkbench(page)
  await expect(page.getByRole('button', { name: /Carton A/ }).first()).toBeVisible()
  await deleteTemplatesByName(page, [renamed, templateName])
})

test('N: Chinese and English expose the same template actions', async ({ page }) => {
  test.setTimeout(60_000)
  const filePath = await createMappedWorkbook()
  await page.goto('/')
  await expect(page.locator('header').getByRole('button', { name: '工作台' })).toBeVisible()
  await openImport(page, filePath)
  await expect(page.getByTestId('template-selection-panel')).toContainText('选择导入模板')
  await expect(page.getByTestId('use-without-template')).toHaveText('不使用模板')
  await useWithoutTemplate(page)
  await expect(page.getByTestId('mapping-required-length')).toBeVisible()
  await expect(page.getByText('* 表示完成当前配置所必需的项目')).toBeVisible()
  await mapColumns(page, templateMapping)
  await page.getByTestId('import-template-name').fill(uniqueName('zh'))
  await expect(page.getByTestId('save-import-template')).toHaveText('保存模板')
  await expect(page.getByTestId('confirm-mapping')).toHaveText('确认导入')
  await cancelImport(page)

  await openEnglish(page)
  await openImport(page, filePath)
  await expect(page.getByTestId('template-selection-panel')).toContainText('Choose an import template')
  await expect(page.getByTestId('use-without-template')).toHaveText('Continue without a template')
  await useWithoutTemplate(page)
  await expect(page.getByTestId('mapping-required-length')).toBeVisible()
  await mapColumns(page, templateMapping)
  await setCmUnits(page)
  await page.getByTestId('import-template-name').fill(uniqueName('en'))
  await expect(page.getByTestId('save-import-template')).toHaveText('Save template')
  await expect(page.getByTestId('confirm-mapping')).toHaveText('Confirm import')
  await page.getByTestId('template-selection-back').click()
  const existingName = uniqueName('en-existing')
  await useWithoutTemplate(page)
  await mapColumns(page, templateMapping)
  await setCmUnits(page)
  await page.getByTestId('import-template-name').fill(existingName)
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toBeVisible()
  await page.getByTestId('map-select-name').selectOption('Code')
  await expect(page.getByTestId('update-import-template')).toHaveText('Update template')
  await expect(page.getByTestId('save-as-import-template')).toHaveText('Save as template')
  await cancelImport(page)
  await deleteTemplatesByName(page, [existingName])
})

test('O: Russian fixture maps 31 pallets and packs 31/31', async ({ page }) => {
  test.setTimeout(60_000)
  await openEnglish(page)
  await page.getByRole('button', { name: /Delete cargo: Carton A/ }).click()
  await page.getByLabel('Container type').selectOption('custom')
  await page.getByLabel('Length mm').first().fill('13400')
  await page.getByLabel('Width mm').first().fill('2450')
  await page.getByLabel('Height mm').first().fill('2650')
  await page.getByLabel('Max payload kg').fill('30000')
  await openImport(page, realWorkbookPath())
  await useWithoutTemplate(page)
  await mapColumns(page, {
    label: '托盘',
    length: '长cm',
    width: '宽cm',
    height: '高cm',
    weight: '整托重量kg',
  })
  await setCmUnits(page)
  await expect(page.getByTestId('mapping-parse-summary')).toContainText('31 ok')
  await page.getByTestId('confirm-mapping').click()
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 31')).toBeVisible()
  await page.getByLabel('Loading rules').selectOption('volume')
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  await expect(page.getByText(/Loaded: 31 \/ 31/)).toBeVisible({ timeout: 15_000 })
})

test('O: Vietnam fixture maps 24 cargos through combined dimensions', async ({ page }) => {
  test.slow()
  await openEnglish(page)
  await openImport(page, vietnamWorkbookPath())
  await useWithoutTemplate(page)
  await page.getByTestId('template-header-row').fill('2')
  await page.getByTestId('template-start-row').fill('3')
  await page.getByTestId('template-dimension-mode').selectOption('combined')
  await expect(page.getByTestId('mapping-required-combinedColumn')).toBeVisible()
  await expect(page.getByTestId('mapping-required-dimensionOrder')).toBeVisible()
  await page.getByTestId('template-combined-column').selectOption('外箱尺寸（mm）')
  await mapColumns(page, {
    label: '物料代码SKU',
    name: '物料名称',
    weight: '产品毛重(KG)/箱',
    quantity: '箱数',
  })
  await expect(page.getByTestId('mapping-parse-summary')).toContainText('24 ok / 0 err')
  await page.getByTestId('confirm-mapping').click()
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 24')).toBeVisible()
  await expect(page.getByRole('button', { name: /世喜PPSU款新生儿奶瓶-防胀气系列160mL越南版（0-1）/ }).first()).toBeVisible()
  await expect(page.getByText(/TB-C10-EV_v1\.1/).first()).toBeVisible()
  await expect(page.getByText(/530 x 305 x 310 mm/).first()).toBeVisible()
})

test('P: Vietnam saved template keeps 20GP quantity manual 3D hotkeys scoped to the workspace', async ({ page }) => {
  test.slow()
  await openEnglish(page)
  const templateName = uniqueName('vietnam-manual-3d')

  await openImport(page, vietnamWorkbookPath())
  await useWithoutTemplate(page)
  await page.getByTestId('template-header-row').fill('2')
  await page.getByTestId('template-start-row').fill('3')
  await page.getByTestId('template-dimension-mode').selectOption('combined')
  await page.getByTestId('template-combined-column').selectOption('外箱尺寸（mm）')
  await mapColumns(page, {
    label: '物料代码SKU',
    name: '物料名称',
    weight: '产品毛重(KG)/箱',
    quantity: '箱数',
  })
  await expect(page.getByTestId('mapping-parse-summary')).toContainText('24 ok / 0 err')
  await page.getByTestId('import-template-name').fill(templateName)
  await page.getByTestId('save-import-template').click()
  await expect(page.getByTestId('template-save-status')).toContainText(templateName)
  await cancelImport(page)

  await openImport(page, vietnamWorkbookPath())
  await selectTemplateByName(page, templateName)
  await expect(page.getByTestId('template-combined-column')).toHaveValue('外箱尺寸（mm）')
  await expect(page.getByTestId('map-select-label')).toHaveValue('物料代码SKU')
  await page.getByTestId('confirm-mapping').click()
  await expect(page.getByTestId('import-log-panel').getByText('Import success: 24')).toBeVisible()

  await page.getByLabel('Container type').selectOption('20gp')
  await page.getByLabel('Loading rules').selectOption('quantity')
  await page.getByRole('button', { name: 'Load', exact: true }).click()
  const scene = page.getByTestId('container-scene')
  await expect(scene).toHaveAttribute('data-box-count', /^[1-9]\d*$/, { timeout: 60_000 })
  const automaticCount = Number(await scene.getAttribute('data-box-count'))

  await page.getByTestId('continue-manually').click()
  await expect(page.getByTestId('manual-workspace')).toBeVisible()
  await expect(scene).toHaveAttribute('data-box-count', String(automaticCount))
  const poolBefore = await poolRemainingTotal(page)

  await selectBoxBy3dCanvasHit(page)
  await expect(scene).toBeFocused()
  await page.keyboard.press('m')
  await expect(scene).toHaveAttribute('data-clearance-enabled', 'true')
  await page.keyboard.press('Delete')
  await expect(scene).toHaveAttribute('data-box-count', String(automaticCount - 1))
  expect(await poolRemainingTotal(page)).toBe(poolBefore + 1)

  await page.keyboard.press('Control+z')
  await expect(scene).toHaveAttribute('data-box-count', String(automaticCount))
  expect(await poolRemainingTotal(page)).toBe(poolBefore)

  await page.getByLabel('Shipment name').focus()
  await page.keyboard.press('m')
  await page.keyboard.press('Delete')
  await expect(scene).toHaveAttribute('data-box-count', String(automaticCount))
  await expect(scene).toHaveAttribute('data-clearance-enabled', 'true')

  await selectBoxBy3dCanvasHit(page)
  await page.keyboard.press('Backspace')
  await expect(scene).toHaveAttribute('data-box-count', String(automaticCount - 1))
  expect(await poolRemainingTotal(page)).toBe(poolBefore + 1)
  await page.keyboard.press('Control+z')
  await expect(scene).toHaveAttribute('data-box-count', String(automaticCount))
  expect(await poolRemainingTotal(page)).toBe(poolBefore)

  await page.getByTestId('nav-history').focus()
  await page.keyboard.press('m')
  await page.keyboard.press('Delete')
  await expect(scene).toHaveAttribute('data-box-count', String(automaticCount))
  await page.getByTestId('nav-history').click()
  await expect(page.getByTestId('history-page')).toBeVisible()
  await page.getByTestId('nav-overview').click()
  await expect(page.getByTestId('visual-workspace')).toBeVisible()
  await deleteTemplatesByName(page, [templateName])
})
