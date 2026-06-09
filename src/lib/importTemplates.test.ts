import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportTemplatePayload } from './importTemplates'
import {
  deleteImportTemplate,
  updateImportTemplate,
} from './importTemplates'
import { fetchWithAuth } from './auth'

vi.mock('./auth', () => ({
  fetchWithAuth: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchWithAuth)

const payload: ImportTemplatePayload = {
  name: 'Template A',
  mapping: { label: 'Label', length: 'L' },
  units: { length: 'mm', width: 'mm', height: 'mm' },
  headerRow: 1,
  startRow: 2,
  mergeRows: 'none',
  dimensionMode: 'combined',
  combinedColumn: '外箱尺寸（mm）',
  dimensionOrder: ['length', 'width', 'height'],
  defaultValues: { quantity: 1, canRotate: true, stackable: true },
}

describe('import template api client', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('updates import templates through the existing backend route', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'tpl-1', ...payload }), { status: 200 }))

    await expect(updateImportTemplate('tpl-1', payload)).resolves.toMatchObject({ id: 'tpl-1', name: 'Template A' })
    expect(mockedFetch).toHaveBeenCalledWith('/api/import-templates/tpl-1', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  })

  it('deletes import templates through the existing backend route', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'deleted' }), { status: 200 }))

    await expect(deleteImportTemplate('tpl-1')).resolves.toBe(true)
    expect(mockedFetch).toHaveBeenCalledWith('/api/import-templates/tpl-1', {
      method: 'DELETE',
    })
  })
})
