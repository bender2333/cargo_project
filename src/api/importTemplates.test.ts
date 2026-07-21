import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImportTemplate } from '../types'
import { fetchWithAuth } from './client'
import {
  deleteImportTemplate,
  readImportTemplates,
  saveImportTemplate,
  updateImportTemplate,
} from './importTemplates'
import type { ImportTemplatePayload } from './importTemplates'

vi.mock('./client', () => ({
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
  defaultValues: {
    label: 'BX',
    name: 'Box',
    quantity: 2,
    color: '#f97316',
    canRotate: true,
    stackable: false,
    maxStackLayers: 3,
    groundOnly: true,
  },
}

const template: ImportTemplate = {
  id: 'tpl-1',
  name: payload.name,
  mapping: payload.mapping,
  units: payload.units,
  headerRow: 1,
  startRow: 2,
  mergeRows: 'none',
  dimensionMode: 'combined',
  combinedColumn: '外箱尺寸（mm）',
  dimensionOrder: ['length', 'width', 'height'],
  defaultValues: payload.defaultValues ?? {},
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T01:00:00.000Z',
}

const dto = {
  ...template,
  mapping: {
    ...template.mapping,
    obsoleteMapping: 'discard-me',
  },
  defaultValues: {
    ...template.defaultValues,
    obsoleteDefault: 'discard-me',
  },
}

describe('import template API', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('maps DTOs into ImportTemplate values and filters nested defaults', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify([dto]), { status: 200 }))

    await expect(readImportTemplates()).resolves.toEqual([template])
    expect(mockedFetch).toHaveBeenCalledWith('/api/import-templates')
  })

  it('normalizes legacy templates with missing or invalid optional fields', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify([{
      id: 'legacy',
      name: 'Legacy template',
      mapping: { length: 'Length', quantity: 7 },
      units: { length: 'cm', width: 'legacy-unit' },
      headerRow: 0,
      startRow: 1,
      mergeRows: 'legacy-mode',
      dimensionMode: 'legacy-mode',
      combinedColumn: null,
      dimensionOrder: ['width', 'width', 'height'],
      defaultValues: {
        quantity: 0,
        maxStackLayers: 2.9,
        groundOnly: false,
        obsoleteDefault: true,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }]), { status: 200 }))

    await expect(readImportTemplates()).resolves.toEqual([{
      id: 'legacy',
      name: 'Legacy template',
      mapping: { length: 'Length', quantity: '7' },
      units: { length: 'cm', width: 'auto', height: 'auto' },
      headerRow: 1,
      startRow: 2,
      mergeRows: 'none',
      dimensionMode: 'separate',
      combinedColumn: '',
      dimensionOrder: ['length', 'width', 'height'],
      defaultValues: {
        quantity: 1,
        maxStackLayers: 2,
        groundOnly: false,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }])
  })

  it('saves and updates with the existing request payload', async () => {
    const payloadWithTransportFields = {
      ...payload,
      mapping: {
        ...payload.mapping,
        obsoleteMapping: 'discard-me',
      },
      defaultValues: {
        label: 'BX',
        name: 'Box',
        quantity: 2,
        color: '#f97316',
        canRotate: true,
        stackable: false,
        maxStackLayers: 3,
        groundOnly: true,
        obsoleteDefault: 'discard-me',
      },
    } as ImportTemplatePayload
    mockedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(dto), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(dto), { status: 200 }))

    await expect(saveImportTemplate(payloadWithTransportFields)).resolves.toEqual(template)
    await expect(updateImportTemplate('tpl-1', payloadWithTransportFields)).resolves.toEqual(template)

    expect(mockedFetch).toHaveBeenNthCalledWith(1, '/api/import-templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    expect(mockedFetch).toHaveBeenNthCalledWith(2, '/api/import-templates/tpl-1', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  })

  it('deletes templates through the existing endpoint', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'deleted' }), { status: 200 }))

    await expect(deleteImportTemplate('tpl-1')).resolves.toBeUndefined()
    expect(mockedFetch).toHaveBeenCalledWith('/api/import-templates/tpl-1', {
      method: 'DELETE',
    })
  })

  it('rejects list, save, update, and delete failures instead of reporting success', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(readImportTemplates()).rejects.toThrow('导入模板加载失败')
    await expect(saveImportTemplate(payload)).rejects.toThrow('保存模板失败')
    await expect(updateImportTemplate('missing', payload)).rejects.toThrow('保存模板失败')
    await expect(deleteImportTemplate('missing')).rejects.toThrow('删除模板失败')
  })
})
