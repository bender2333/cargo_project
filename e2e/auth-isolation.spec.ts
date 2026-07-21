import path from 'node:path'
import { expect, test } from '@playwright/test'

function importTemplateDto(id: string, name: string) {
  return {
    id,
    name,
    mapping: { label: 'Label', length: 'Length', width: 'Width', height: 'Height' },
    units: { length: 'mm', width: 'mm', height: 'mm' },
    headerRow: 1,
    startRow: 2,
    mergeRows: 'none',
    dimensionMode: 'separate',
    combinedColumn: '',
    dimensionOrder: ['length', 'width', 'height'],
    defaultValues: { quantity: 1, canRotate: true, stackable: true },
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  }
}

function exportTemplateDto(id: string, name: string) {
  return {
    id,
    name,
    columns: [
      { field: 'label', header: 'Label' },
      { field: 'name', header: 'Name' },
      { field: 'originalLength', header: 'Length', unit: 'mm' },
    ],
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
  }
}

function realWorkbookPath() {
  return path.join(process.cwd(), 'test-data', 'excel', '俄罗斯整托装柜尺寸.xlsx')
}

test.describe('Auth Gating, User Isolation, and Admin Panel', () => {
  const testPassword = 'Password123!'

  test('redirects unauthenticated users to login page', async ({ page }) => {
    await page.goto('/')
    // Verify login page elements are shown
    await expect(page.getByText('货柜装箱计算系统')).toBeVisible()
    await expect(page.locator('#username')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
  })

  test('surfaces custom container bootstrap failures in the workbench', async ({ page }) => {
    let reads = 0
    await page.route('**/api/containers/custom', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads > 1) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          return
        }
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database unavailable' }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')

    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await expect(page.getByTestId('container-change-notice')).toHaveText('柜型加载失败')
    await page.getByTestId('placement-mode-manual').click()
    await expect(page.getByTestId('manual-workspace')).toBeVisible()
    await expect(page.getByTestId('container-change-notice')).toBeVisible()
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.getByTestId('container-change-notice')).toHaveText('Container load failed')

    await page.getByTestId('manage-custom-containers').click()
    await expect(page.getByText('自定义柜型管理')).toBeVisible()
    await page.getByRole('button', { name: '×' }).click()
    await expect(page.getByTestId('container-change-notice')).toHaveCount(0)
  })

  test('surfaces history failures and ignores a stale failure', async ({ page }) => {
    let reads = 0
    let releaseStaleFailure!: () => void
    const staleFailureGate = new Promise<void>((resolve) => {
      releaseStaleFailure = resolve
    })
    await page.route('**/api/history', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads === 2) {
          await staleFailureGate
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Stale database failure' }),
          })
          return
        }
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1 ? JSON.stringify({ error: 'Database unavailable' }) : '[]',
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    await page.getByTestId('nav-history').click()
    await expect(page.getByTestId('history-load-error')).toHaveText(/历史方案加载失败/)
    await expect(page.getByTestId('history-empty-state')).toHaveCount(0)

    const retry = page.getByRole('button', { name: '重试', exact: true })
    await retry.click()
    await retry.click()
    await expect.poll(() => reads).toBe(3)
    await expect(page.getByTestId('history-load-error')).toHaveCount(0)
    await expect(page.getByTestId('history-empty-state')).toBeVisible()

    const staleFailureResponse = page.waitForResponse((response) => (
      response.url().includes('/api/history')
      && response.request().method() === 'GET'
      && response.status() === 500
    ))
    releaseStaleFailure()
    await staleFailureResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByTestId('history-load-error')).toHaveCount(0)
    await expect(page.getByTestId('history-empty-state')).toBeVisible()
  })

  test('keeps the latest history list when an older success finishes last', async ({ page }) => {
    let reads = 0
    let releaseStaleSuccess!: () => void
    const staleSuccessGate = new Promise<void>((resolve) => {
      releaseStaleSuccess = resolve
    })
    const latestPlanDto = {
      id: 'latest-plan',
      created_at: '2026-07-21T00:00:00.000Z',
      project_name: 'Latest history project',
      shipment_name: 'Latest shipment',
      loading_mode: 'quantity',
      data: {
        containerId: '20gp',
        container: {
          id: '20gp',
          label: '20GP',
          description: 'Standard container',
          length: 5898,
          width: 2352,
          height: 2393,
          maxWeight: 28000,
          doorGap: 0,
          topGap: 0,
          sideGap: 0,
        },
        cargoItems: [],
        placedCount: 0,
        totalCargoCount: 0,
        layerCount: 0,
        labelSummary: '',
      },
    }
    await page.route('**/api/history', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads === 2) {
          await staleSuccessGate
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          return
        }
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1
            ? JSON.stringify({ error: 'Database unavailable' })
            : JSON.stringify([latestPlanDto]),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    await page.getByTestId('nav-history').click()
    await expect(page.getByTestId('history-load-error')).toBeVisible()

    const retry = page.getByRole('button', { name: '重试', exact: true })
    await retry.click()
    await retry.click()
    await expect.poll(() => reads).toBe(3)
    await expect(page.getByText('Latest history project')).toBeVisible()

    const staleSuccessResponse = page.waitForResponse((response) => (
      response.url().includes('/api/history')
      && response.request().method() === 'GET'
      && response.status() === 200
    ))
    releaseStaleSuccess()
    await staleSuccessResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByText('Latest history project')).toBeVisible()
    await expect(page.getByTestId('history-empty-state')).toHaveCount(0)
  })

  test('surfaces cargo library failures and ignores a stale retry error', async ({ page }) => {
    let reads = 0
    let releaseStaleFailure!: () => void
    const staleFailureGate = new Promise<void>((resolve) => {
      releaseStaleFailure = resolve
    })
    await page.route('**/api/custom-cargo', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads === 2) {
          await staleFailureGate
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Stale cargo library failure' }),
          })
          return
        }
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1 ? JSON.stringify({ error: 'Database unavailable' }) : '[]',
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    await page.getByTestId('nav-cargo-library').click()
    await expect(page.getByTestId('cargo-library-load-error')).toHaveText(/货物库加载失败/)
    await expect(page.getByTestId('cargo-library-empty-state')).toHaveCount(0)

    const retry = page.getByRole('button', { name: '重试', exact: true })
    await retry.click()
    await retry.click()
    await expect.poll(() => reads).toBe(3)
    await expect(page.getByTestId('cargo-library-load-error')).toHaveCount(0)
    await expect(page.getByTestId('cargo-library-empty-state')).toBeVisible()

    const staleFailureResponse = page.waitForResponse((response) => (
      response.url().includes('/api/custom-cargo')
      && response.request().method() === 'GET'
      && response.status() === 500
    ))
    releaseStaleFailure()
    await staleFailureResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByTestId('cargo-library-load-error')).toHaveCount(0)
    await expect(page.getByTestId('cargo-library-empty-state')).toBeVisible()
  })

  test('keeps the latest cargo library list when an older success finishes last', async ({ page }) => {
    let reads = 0
    let releaseStaleSuccess!: () => void
    const staleSuccessGate = new Promise<void>((resolve) => {
      releaseStaleSuccess = resolve
    })
    const latestCargoDto = {
      id: 'latest-cargo',
      name: 'Latest cargo library item',
      label: 'LC',
      length: 900,
      width: 700,
      height: 500,
      weight: 33,
      quantity: 1,
      color: '#f97316',
      canRotate: true,
      stackable: true,
      maxStackLayers: 2,
      groundOnly: false,
      createdAt: '2026-07-22T00:00:00.000Z',
    }
    await page.route('**/api/custom-cargo', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads === 2) {
          await staleSuccessGate
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          return
        }
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1
            ? JSON.stringify({ error: 'Database unavailable' })
            : JSON.stringify([latestCargoDto]),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.getByTestId('nav-cargo-library').click()
    await expect(page.getByTestId('cargo-library-load-error')).toBeVisible()

    const retry = page.getByRole('button', { name: '重试', exact: true })
    await retry.click()
    await retry.click()
    await expect.poll(() => reads).toBe(3)
    await expect(page.getByText('Latest cargo library item')).toBeVisible()

    const staleSuccessResponse = page.waitForResponse((response) => (
      response.url().includes('/api/custom-cargo')
      && response.request().method() === 'GET'
      && response.status() === 200
    ))
    releaseStaleSuccess()
    await staleSuccessResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByText('Latest cargo library item')).toBeVisible()
    await expect(page.getByTestId('cargo-library-empty-state')).toHaveCount(0)
  })

  test('keeps cargo library save and delete failures visible', async ({ page }) => {
    const cargoDto = {
      id: 'cargo-failure-fixture',
      name: 'Failure fixture cargo',
      label: 'FF',
      length: 900,
      width: 700,
      height: 500,
      weight: 33,
      quantity: 1,
      color: '#f97316',
      canRotate: true,
      stackable: true,
      maxStackLayers: 2,
      groundOnly: false,
      createdAt: '2026-07-22T00:00:00.000Z',
    }
    await page.route('**/api/custom-cargo**', async (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([cargoDto]) })
        return
      }
      if (method === 'POST' || method === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database unavailable' }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.getByTestId('nav-cargo-library').click()
    await expect(page.getByText('Failure fixture cargo')).toBeVisible()

    const saveDialog = page.waitForEvent('dialog').then(async (dialog) => {
      expect(dialog.message()).toBe('保存货物失败')
      await dialog.dismiss()
    })
    await Promise.all([saveDialog, page.getByTestId('cargo-library-add').click()])

    const deleteDialog = page.waitForEvent('dialog').then(async (dialog) => {
      expect(dialog.message()).toBe('删除货物失败')
      await dialog.dismiss()
    })
    await Promise.all([deleteDialog, page.getByTestId('cargo-library-delete-cargo-failure-fixture').click()])
    await expect(page.getByText('Failure fixture cargo')).toBeVisible()
  })

  test('surfaces import template failures and ignores a stale retry error', async ({ page }) => {
    let reads = 0
    let releaseStaleFailure!: () => void
    const staleFailureGate = new Promise<void>((resolve) => {
      releaseStaleFailure = resolve
    })
    await page.route('**/api/import-templates', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads === 2) {
          await staleFailureGate
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Stale import template failure' }),
          })
          return
        }
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1 ? JSON.stringify({ error: 'Database unavailable' }) : '[]',
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    await page.getByTestId('nav-template-manager').click()
    await expect(page.getByTestId('import-template-load-error')).toHaveText(/导入模板加载失败/)
    await expect(page.getByTestId('template-manager-empty-state')).toHaveCount(0)

    const retry = page.getByRole('button', { name: '重试', exact: true })
    await retry.click()
    await retry.click()
    await expect.poll(() => reads).toBe(3)
    await expect(page.getByTestId('import-template-load-error')).toHaveCount(0)
    await expect(page.getByTestId('template-manager-empty-state')).toBeVisible()

    const staleFailureResponse = page.waitForResponse((response) => (
      response.url().includes('/api/import-templates')
      && response.request().method() === 'GET'
      && response.status() === 500
    ))
    releaseStaleFailure()
    await staleFailureResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByTestId('import-template-load-error')).toHaveCount(0)
    await expect(page.getByTestId('template-manager-empty-state')).toBeVisible()
  })

  test('keeps the latest import template list when an older success finishes last', async ({ page }) => {
    let reads = 0
    let releaseStaleSuccess!: () => void
    const staleSuccessGate = new Promise<void>((resolve) => {
      releaseStaleSuccess = resolve
    })
    const latestTemplateDto = {
      id: 'latest-template',
      name: 'Latest import template',
      mapping: { label: 'Label', length: 'Length', width: 'Width', height: 'Height' },
      units: { length: 'mm', width: 'mm', height: 'mm' },
      headerRow: 1,
      startRow: 2,
      mergeRows: 'none',
      dimensionMode: 'separate',
      combinedColumn: '',
      dimensionOrder: ['length', 'width', 'height'],
      defaultValues: { quantity: 1, canRotate: true, stackable: true },
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    }
    await page.route('**/api/import-templates', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads === 2) {
          await staleSuccessGate
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          return
        }
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1
            ? JSON.stringify({ error: 'Database unavailable' })
            : JSON.stringify([latestTemplateDto]),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.getByTestId('nav-template-manager').click()
    await expect(page.getByTestId('import-template-load-error')).toBeVisible()

    const retry = page.getByRole('button', { name: '重试', exact: true })
    await retry.click()
    await retry.click()
    await expect.poll(() => reads).toBe(3)
    await expect(page.getByText('Latest import template')).toBeVisible()

    const staleSuccessResponse = page.waitForResponse((response) => (
      response.url().includes('/api/import-templates')
      && response.request().method() === 'GET'
      && response.status() === 200
    ))
    releaseStaleSuccess()
    await staleSuccessResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByText('Latest import template')).toBeVisible()
    await expect(page.getByTestId('template-manager-empty-state')).toHaveCount(0)
  })

  test('shows import template load failure in the mapping dialog and recovers on retry', async ({ page }) => {
    let reads = 0
    await page.route('**/api/import-templates', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1 ? JSON.stringify({ error: 'Database unavailable' }) : '[]',
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    await page.locator('input[accept*="xlsx"]').setInputFiles(realWorkbookPath())
    await expect(page.getByTestId('mapping-modal')).toBeVisible()
    const dialogError = page.getByTestId('import-template-dialog-load-error')
    const templateSelect = page.getByTestId('import-template-select')
    await expect(dialogError).toHaveText(/导入模板加载失败/)
    await expect(templateSelect).toBeDisabled()

    await dialogError.getByRole('button', { name: '重试', exact: true }).click()
    await expect.poll(() => reads).toBe(2)
    await expect(dialogError).toHaveCount(0)
    await expect(templateSelect).toBeEnabled()
  })

  test('keeps a newly created import template when the bootstrap list finishes last', async ({ page }) => {
    let reads = 0
    let writes = 0
    let releaseBootstrap!: () => void
    const bootstrapGate = new Promise<void>((resolve) => {
      releaseBootstrap = resolve
    })
    const createdTemplate = importTemplateDto('created-during-bootstrap', 'Created during bootstrap')
    const existingTemplate = importTemplateDto('existing-before-bootstrap', 'Existing before bootstrap')

    await page.route('**/api/import-templates**', async (route) => {
      const method = route.request().method()
      const pathname = new URL(route.request().url()).pathname
      if (method === 'GET' && pathname === '/api/import-templates') {
        reads += 1
        if (reads === 1) {
          await bootstrapGate
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([createdTemplate, existingTemplate]),
        })
        return
      }
      if (method === 'POST' && pathname === '/api/import-templates') {
        writes += 1
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdTemplate),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await expect.poll(() => reads).toBe(1)

    await page.getByTestId('nav-template-manager').click()
    await page.getByTestId('template-manager-new').click()
    await page.getByTestId('template-manager-new-name').fill(createdTemplate.name)
    await page.getByTestId('template-manager-new-save').click()
    await expect.poll(() => writes).toBe(1)
    await expect.poll(() => reads).toBe(2)
    await expect(page.getByTestId(`template-manager-row-${createdTemplate.id}`)).toContainText(createdTemplate.name)
    await expect(page.getByTestId(`template-manager-row-${existingTemplate.id}`)).toContainText(existingTemplate.name)

    const staleBootstrapResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/api/import-templates'
      && response.request().method() === 'GET'
      && response.status() === 200
    ))
    releaseBootstrap()
    await staleBootstrapResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByTestId(`template-manager-row-${createdTemplate.id}`)).toContainText(createdTemplate.name)
    await expect(page.getByTestId(`template-manager-row-${existingTemplate.id}`)).toContainText(existingTemplate.name)
  })

  test('keeps import template update and delete failures visible', async ({ page }) => {
    const existingTemplate = importTemplateDto('template-write-failure', 'Protected import template')
    let updates = 0
    let deletes = 0
    await page.route('**/api/import-templates**', async (route) => {
      const method = route.request().method()
      const pathname = new URL(route.request().url()).pathname
      if (method === 'GET' && pathname === '/api/import-templates') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([existingTemplate]),
        })
        return
      }
      if (method === 'PUT' && pathname === `/api/import-templates/${existingTemplate.id}`) {
        updates += 1
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template name already exists' }),
        })
        return
      }
      if (method === 'DELETE' && pathname === `/api/import-templates/${existingTemplate.id}`) {
        deletes += 1
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database unavailable' }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.getByTestId('nav-template-manager').click()

    const row = page.getByTestId(`template-manager-row-${existingTemplate.id}`)
    await expect(row).toContainText(existingTemplate.name)
    await page.getByTestId(`template-manager-edit-${existingTemplate.id}`).click()
    await page.getByTestId(`template-manager-name-${existingTemplate.id}`).fill('Rejected template rename')

    const updateDialog = page.waitForEvent('dialog').then(async (dialog) => {
      expect(dialog.message()).toBe('更新模板失败')
      await dialog.dismiss()
    })
    await Promise.all([
      updateDialog,
      page.getByTestId(`template-manager-save-${existingTemplate.id}`).click(),
    ])
    await expect.poll(() => updates).toBe(1)
    await row.getByRole('button', { name: '取消', exact: true }).click()
    await expect(row).toContainText(existingTemplate.name)

    const deleteDialog = page.waitForEvent('dialog').then(async (dialog) => {
      expect(dialog.message()).toBe('删除模板失败')
      await dialog.dismiss()
    })
    await Promise.all([
      deleteDialog,
      page.getByTestId(`template-manager-delete-${existingTemplate.id}`).click(),
    ])
    await expect.poll(() => deletes).toBe(1)
    await expect(row).toContainText(existingTemplate.name)
  })

  test('surfaces export template failures without blocking the default export and recovers on retry', async ({ page }) => {
    let reads = 0
    await page.route('**/api/export-templates', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1 ? JSON.stringify({ error: 'Database unavailable' }) : '[]',
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    await page.getByTestId('nav-template-manager').click()
    await expect(page.getByTestId('export-template-load-error')).toHaveText(/导出模板加载失败/)
    await expect(page.getByTestId('export-template-empty-state')).toHaveCount(0)

    await page.getByTestId('nav-overview').click()
    const toolbarError = page.getByTestId('export-template-toolbar-load-error')
    const exportSelect = page.getByTestId('export-template-select')
    await expect(toolbarError).toHaveText(/导出模板加载失败/)
    await expect(exportSelect).toBeDisabled()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 XLSX', exact: true }).click()
    await downloadPromise

    await toolbarError.getByRole('button', { name: '重试', exact: true }).click()
    await expect.poll(() => reads).toBe(2)
    await expect(toolbarError).toHaveCount(0)
    await expect(exportSelect).toBeEnabled()

    await page.getByTestId('nav-template-manager').click()
    await expect(page.getByTestId('export-template-load-error')).toHaveCount(0)
    await expect(page.getByTestId('export-template-empty-state')).toBeVisible()
  })

  test('keeps the latest export template list when an older failure finishes last', async ({ page }) => {
    let reads = 0
    let releaseStaleFailure!: () => void
    const staleFailureGate = new Promise<void>((resolve) => {
      releaseStaleFailure = resolve
    })
    const latestTemplate = exportTemplateDto('latest-export-after-failure', 'Latest export after failure')
    await page.route('**/api/export-templates', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads === 2) {
          await staleFailureGate
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Stale export template failure' }),
          })
          return
        }
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1
            ? JSON.stringify({ error: 'Database unavailable' })
            : JSON.stringify([latestTemplate]),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.getByTestId('nav-template-manager').click()
    await expect(page.getByTestId('export-template-load-error')).toBeVisible()

    const retry = page.getByTestId('export-template-load-error').getByRole('button', { name: '重试', exact: true })
    await retry.click()
    await retry.click()
    await expect.poll(() => reads).toBe(3)
    await expect(page.getByTestId(`export-template-row-${latestTemplate.id}`)).toContainText(latestTemplate.name)

    const staleFailureResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/api/export-templates'
      && response.request().method() === 'GET'
      && response.status() === 500
    ))
    releaseStaleFailure()
    await staleFailureResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByTestId('export-template-load-error')).toHaveCount(0)
    await expect(page.getByTestId(`export-template-row-${latestTemplate.id}`)).toContainText(latestTemplate.name)
  })

  test('keeps the latest export template list when an older success finishes last', async ({ page }) => {
    let reads = 0
    let releaseStaleSuccess!: () => void
    const staleSuccessGate = new Promise<void>((resolve) => {
      releaseStaleSuccess = resolve
    })
    const latestTemplate = exportTemplateDto('latest-export-after-success', 'Latest export after success')
    await page.route('**/api/export-templates', async (route) => {
      if (route.request().method() === 'GET') {
        reads += 1
        if (reads === 2) {
          await staleSuccessGate
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          return
        }
        await route.fulfill({
          status: reads === 1 ? 500 : 200,
          contentType: 'application/json',
          body: reads === 1
            ? JSON.stringify({ error: 'Database unavailable' })
            : JSON.stringify([latestTemplate]),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.getByTestId('nav-template-manager').click()
    await expect(page.getByTestId('export-template-load-error')).toBeVisible()

    const retry = page.getByTestId('export-template-load-error').getByRole('button', { name: '重试', exact: true })
    await retry.click()
    await retry.click()
    await expect.poll(() => reads).toBe(3)
    await expect(page.getByTestId(`export-template-row-${latestTemplate.id}`)).toContainText(latestTemplate.name)

    const staleSuccessResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/api/export-templates'
      && response.request().method() === 'GET'
      && response.status() === 200
    ))
    releaseStaleSuccess()
    await staleSuccessResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByTestId(`export-template-row-${latestTemplate.id}`)).toContainText(latestTemplate.name)
    await expect(page.getByTestId('export-template-empty-state')).toHaveCount(0)
  })

  test('keeps authoritative export templates when the bootstrap list finishes after create', async ({ page }) => {
    let reads = 0
    let writes = 0
    let releaseBootstrap!: () => void
    const bootstrapGate = new Promise<void>((resolve) => {
      releaseBootstrap = resolve
    })
    const createdTemplate = exportTemplateDto('created-export-during-bootstrap', 'Created export during bootstrap')
    const existingTemplate = exportTemplateDto('existing-export-before-bootstrap', 'Existing export before bootstrap')

    await page.route('**/api/export-templates**', async (route) => {
      const method = route.request().method()
      const pathname = new URL(route.request().url()).pathname
      if (method === 'GET' && pathname === '/api/export-templates') {
        reads += 1
        if (reads === 1) {
          await bootstrapGate
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          return
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([createdTemplate, existingTemplate]),
        })
        return
      }
      if (method === 'POST' && pathname === '/api/export-templates') {
        writes += 1
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdTemplate),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await expect.poll(() => reads).toBe(1)

    await page.getByTestId('nav-template-manager').click()
    await page.getByTestId('export-template-new').click()
    await page.getByTestId('export-template-new-name').fill(createdTemplate.name)
    await page.getByTestId('export-template-new-save').click()
    await expect.poll(() => writes).toBe(1)
    await expect.poll(() => reads).toBe(2)
    await expect(page.getByTestId(`export-template-row-${createdTemplate.id}`)).toContainText(createdTemplate.name)
    await expect(page.getByTestId(`export-template-row-${existingTemplate.id}`)).toContainText(existingTemplate.name)

    const staleBootstrapResponse = page.waitForResponse((response) => (
      new URL(response.url()).pathname === '/api/export-templates'
      && response.request().method() === 'GET'
      && response.status() === 200
    ))
    releaseBootstrap()
    await staleBootstrapResponse
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    }))
    await expect(page.getByTestId(`export-template-row-${createdTemplate.id}`)).toContainText(createdTemplate.name)
    await expect(page.getByTestId(`export-template-row-${existingTemplate.id}`)).toContainText(existingTemplate.name)
  })

  test('keeps export template create update and delete failures visible', async ({ page }) => {
    const existingTemplate = exportTemplateDto('export-write-failure', 'Protected export template')
    let creates = 0
    let updates = 0
    let deletes = 0
    await page.route('**/api/export-templates**', async (route) => {
      const method = route.request().method()
      const pathname = new URL(route.request().url()).pathname
      if (method === 'GET' && pathname === '/api/export-templates') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([existingTemplate]),
        })
        return
      }
      if (method === 'POST' && pathname === '/api/export-templates') {
        creates += 1
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template name already exists' }),
        })
        return
      }
      if (method === 'PUT' && pathname === `/api/export-templates/${existingTemplate.id}`) {
        updates += 1
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Template name already exists' }),
        })
        return
      }
      if (method === 'DELETE' && pathname === `/api/export-templates/${existingTemplate.id}`) {
        deletes += 1
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database unavailable' }),
        })
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.getByTestId('nav-template-manager').click()

    await page.getByTestId('export-template-new').click()
    await page.getByTestId('export-template-new-name').fill('Rejected export template')
    const createDialog = page.waitForEvent('dialog').then(async (dialog) => {
      expect(dialog.message()).toBe('创建导出模板失败')
      await dialog.dismiss()
    })
    await Promise.all([createDialog, page.getByTestId('export-template-new-save').click()])
    await expect.poll(() => creates).toBe(1)
    await expect(page.locator('[data-testid^="export-template-row-"]').filter({ hasText: 'Rejected export template' })).toHaveCount(0)
    await page.getByTestId('export-template-new-form').getByRole('button', { name: '取消', exact: true }).click()

    const row = page.getByTestId(`export-template-row-${existingTemplate.id}`)
    await expect(row).toContainText(existingTemplate.name)
    await page.getByTestId(`export-template-edit-${existingTemplate.id}`).click()
    await page.getByTestId(`export-template-name-${existingTemplate.id}`).fill('Rejected export rename')
    const updateDialog = page.waitForEvent('dialog').then(async (dialog) => {
      expect(dialog.message()).toBe('更新导出模板失败')
      await dialog.dismiss()
    })
    await Promise.all([
      updateDialog,
      page.getByTestId(`export-template-save-${existingTemplate.id}`).click(),
    ])
    await expect.poll(() => updates).toBe(1)
    await row.getByRole('button', { name: '取消', exact: true }).click()
    await expect(row).toContainText(existingTemplate.name)

    const deleteDialog = page.waitForEvent('dialog').then(async (dialog) => {
      expect(dialog.message()).toBe('删除导出模板失败')
      await dialog.dismiss()
    })
    await Promise.all([
      deleteDialog,
      page.getByTestId(`export-template-delete-${existingTemplate.id}`).click(),
    ])
    await expect.poll(() => deletes).toBe(1)
    await expect(row).toContainText(existingTemplate.name)
  })

  test('keeps the workbench available when the custom container dialog chunk fails', async ({ page }) => {
    const modulePattern = /\/(?:src\/components\/CustomContainerDialog\.tsx|assets\/CustomContainerDialog-[^/]+\.js)(?:\?.*)?$/
    await page.route(modulePattern, (route) => route.abort())

    await page.goto('/')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    await page.getByTestId('manage-custom-containers').click()
    await expect(page.getByTestId('custom-container-dialog-load-error')).toHaveText('柜型管理加载失败')
    await expect(page.getByTestId('visual-workspace')).toBeVisible()

    await page.unroute(modulePattern)
    await page.getByRole('button', { name: '重新加载页面' }).click()
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.getByTestId('manage-custom-containers').click()
    await expect(page.getByText('自定义柜型管理')).toBeVisible()
  })

  test('registers and logs in a new user', async ({ page }) => {
    const user = `u_reg_${Math.random().toString(36).substring(7)}`
    const initialReadPaths = [
      '/api/history',
      '/api/containers/custom',
      '/api/import-templates',
      '/api/export-templates',
      '/api/custom-cargo',
    ]
    const requestCounts = new Map(initialReadPaths.map((path) => [path, 0]))
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (request.method() === 'GET' && requestCounts.has(path)) {
        requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1)
      }
    })
    await page.goto('/')
    
    // Switch to Register page
    await page.click('text=没有账号？立即注册')
    await expect(page.getByText('创建新账号')).toBeVisible()

    // Fill in registration details
    await page.fill('#username', user)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    const initialReads = Promise.all(initialReadPaths.map((path) => page.waitForResponse((response) => (
      response.request().method() === 'GET' && new URL(response.url()).pathname === path
    ))))
    await page.click('button[type="submit"]')

    // After registration, we should be auto-logged in and see the workbench
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await expect(page.getByText(`用户:${user}`)).toBeVisible()
    await initialReads
    await page.waitForLoadState('networkidle')
    expect(Object.fromEntries(requestCounts)).toEqual(Object.fromEntries(
      initialReadPaths.map((path) => [path, 1]),
    ))
  })

  test('ensures strict data isolation for custom containers and history plans', async ({ page }) => {
    const user1 = `u1_iso_${Math.random().toString(36).substring(7)}`
    const user2 = `u2_iso_${Math.random().toString(36).substring(7)}`

    // 1. Log in as user1 and create custom container + history plan
    await page.goto('/')
    await page.click('text=没有账号？立即注册')
    await page.fill('#username', user1)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    // Create a Custom Container for User 1
    await page.click('text=管理自定义柜型')
    await expect(page.getByText('自定义柜型管理')).toBeVisible()
    await page.click('text=+ 新增柜型')
    await page.fill('input[placeholder="例如: 特制小货柜"]', 'Container-User1')
    await page.fill('label:has-text("长 mm") >> xpath=../input', '5100')
    await page.fill('label:has-text("宽 mm") >> xpath=../input', '2100')
    await page.fill('label:has-text("高 mm") >> xpath=../input', '2100')
    await page.fill('label:has-text("最大载重 kg") >> xpath=../input', '11000')
    await page.click('button[type="submit"]:has-text("保存")')
    
    // Verify container is shown in the dialog
    await expect(page.getByText('Container-User1')).toBeVisible()
    // Select it
    await page.click('text=选用')
    
    // Save a History Plan for User 1
    await page.getByLabel('Shipment name').fill('Shipment-User1')
    await page.click('button:has-text("装箱")')
    await page.click('button:has-text("保存方案")')
    
    // Verify plan is in user1's history
    await page.click('button:has-text("历史")')
    await expect(page.getByText('Shipment-User1')).toBeVisible()
    
    // Log out User 1
    await page.click('text=退出')
    await expect(page.getByText('货柜装箱计算系统')).toBeVisible()

    // 2. Register and log in as User 2
    await page.click('text=没有账号？立即注册')
    await page.fill('#username', user2)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    // Open custom container presets dialog
    await page.click('text=管理自定义柜型')
    // Verify User 1's custom container is NOT visible (strict isolation!)
    await expect(page.getByText('Container-User1')).not.toBeVisible()

    // Create User 2's custom container
    await page.click('text=+ 新增柜型')
    await page.fill('input[placeholder="例如: 特制小货柜"]', 'Container-User2')
    await page.fill('label:has-text("长 mm") >> xpath=../input', '6100')
    await page.fill('label:has-text("宽 mm") >> xpath=../input', '2200')
    await page.fill('label:has-text("高 mm") >> xpath=../input', '2200')
    await page.fill('label:has-text("最大载重 kg") >> xpath=../input', '12000')
    await page.click('button[type="submit"]:has-text("保存")')
    await expect(page.getByText('Container-User2')).toBeVisible()
    await page.click('text=选用')

    // Go to History tab
    await page.click('button:has-text("历史")')
    // Verify User 1's shipment plan is NOT visible (strict isolation!)
    await expect(page.getByText('Shipment-User1')).not.toBeVisible()

    // Save a plan for User 2
    await page.click('button:has-text("工作台")')
    await page.getByLabel('Shipment name').fill('Shipment-User2')
    await page.click('button:has-text("装箱")')
    await page.click('button:has-text("保存方案")')
    await page.click('button:has-text("历史")')
    await expect(page.getByText('Shipment-User2')).toBeVisible()

    // Log out User 2
    await page.click('text=退出')
  })

  test('persists custom cargo library per user and can add saved cargo to the workbench', async ({ page }) => {
    const user1 = `u1_cargo_${Math.random().toString(36).substring(7)}`
    const user2 = `u2_cargo_${Math.random().toString(36).substring(7)}`

    await page.goto('/')
    await page.click('text=没有账号？立即注册')
    await page.fill('#username', user1)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    await page.getByTestId('nav-cargo-library').click()
    await expect(page.getByTestId('cargo-library')).toBeVisible()
    await page.getByTestId('cargo-library').getByLabel('名称').fill('CargoLib-User1')
    await page.getByTestId('cargo-library').getByLabel('分组 1').fill('CL')
    await page.getByTestId('cargo-library').getByLabel('长 mm').fill('900')
    await page.getByTestId('cargo-library').getByLabel('宽 mm').fill('700')
    await page.getByTestId('cargo-library').getByLabel('高 mm').fill('500')
    await page.getByTestId('cargo-library').getByLabel('重量 kg').fill('33')
    await page.getByTestId('cargo-library-add').click()
    await expect(page.getByText('CargoLib-User1')).toBeVisible()

    await page.reload()
    await page.getByTestId('nav-cargo-library').click()
    await expect(page.getByText('CargoLib-User1')).toBeVisible()
    const savedRow = page.locator('[data-testid^="cargo-library-row-"]:has-text("CargoLib-User1")')
    await savedRow.getByRole('button', { name: '加入当前工作台' }).click()
    await expect(page.getByRole('button', { name: /CL CargoLib-User1/ })).toBeVisible()

    await page.click('text=退出')
    await page.click('text=没有账号？立即注册')
    await page.fill('#username', user2)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.getByTestId('nav-cargo-library').click()
    await expect(page.getByText('CargoLib-User1')).not.toBeVisible()
  })

  test('allows administrator to manage user accounts', async ({ page }) => {
    const adminUser1 = `u1_adm_${Math.random().toString(36).substring(7)}`
    const adminUser2 = `u2_adm_${Math.random().toString(36).substring(7)}`

    // Register two target users first so they exist in database
    await page.goto('/')
    await page.click('text=没有账号？立即注册')
    await page.fill('#username', adminUser1)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.click('text=退出')

    await page.click('text=没有账号？立即注册')
    await page.fill('#username', adminUser2)
    await page.fill('#password', testPassword)
    await page.fill('#confirmPassword', testPassword)
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()
    await page.click('text=退出')

    // 1. Log in as seeded default administrator
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await expect(page.getByText('货柜排箱装柜工作台')).toBeVisible()

    // Open User Management panel
    await page.getByTestId('user-management-shortcut').click()
    await expect(page.getByTestId('users-page')).toBeVisible()
    await expect(page.getByText('用户账号管理')).toBeVisible()
    await expect(page.getByText('管理员控制面板')).toBeVisible()

    // Verify adminUser1 and adminUser2 are listed
    await expect(page.getByText(adminUser1)).toBeVisible()
    await expect(page.getByText(adminUser2)).toBeVisible()

    // Verify we cannot toggle status or delete the master 'admin' account
    const adminRow = page.locator('tr:has-text("admin")')
    await expect(adminRow.locator('button:has-text("禁用")')).toHaveCount(0)
    await expect(adminRow.locator('button:has-text("删除")')).toHaveCount(0)

    // Disable adminUser1's account
    const user1Row = page.locator(`tr:has-text("${adminUser1}")`)
    await user1Row.locator('button:has-text("禁用")').click()
    await expect(user1Row.locator('text=已禁用')).toBeVisible()

    // Log out Admin
    await page.click('text=返回工作台')
    await page.click('text=退出')

    // 2. Try logging in with disabled adminUser1
    await page.fill('#username', adminUser1)
    await page.fill('#password', testPassword)
    await page.click('button[type="submit"]')
    // Should show error notification
    await expect(page.getByText(/账号已被禁用|Account has been disabled/)).toBeVisible()

    // 3. Log back as admin and delete adminUser2
    await page.fill('#username', 'admin')
    await page.fill('#password', 'admin123')
    await page.click('button[type="submit"]')
    await page.getByTestId('user-management-shortcut').click()
    await expect(page.getByTestId('users-page')).toBeVisible()

    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain(`确定要删除用户 "${adminUser2}" 吗？`)
      await dialog.accept()
    })

    const user2Row = page.locator(`tr:has-text("${adminUser2}")`)
    await user2Row.locator('button:has-text("删除")').click()
    
    // Verify User 2 is removed from table
    await expect(page.getByText(adminUser2)).not.toBeVisible()
  })
})
