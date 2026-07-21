import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportTemplateColumn } from '../types'
import { fetchWithAuth } from './client'
import {
  deleteExportTemplate,
  readExportTemplates,
  saveExportTemplate,
  updateExportTemplate,
} from './exportTemplates'
import type { ExportTemplatePayload } from './exportTemplates'

vi.mock('./client', () => ({
  fetchWithAuth: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchWithAuth)

const rawColumns = [
  { field: 'name', header: 42, unit: 'cm' },
  { field: 'unknownField', header: 'Unknown' },
  { field: 'originalLength', header: 'Length', unit: 'cm' },
  { field: 'name', header: 'Duplicate name' },
  { field: 'actualWidth', header: null, unit: 'inch' },
  { field: 'weight', header: 'Weight', unit: 'mm' },
] as unknown as ExportTemplateColumn[]

const normalizedColumns: ExportTemplateColumn[] = [
  { field: 'name', header: 'name' },
  { field: 'originalLength', header: 'Length', unit: 'cm' },
  { field: 'actualWidth', header: 'actualWidth' },
  { field: 'weight', header: 'Weight' },
]

const payload: ExportTemplatePayload = {
  name: 'Export template',
  columns: rawColumns,
}

const dto = {
  id: 'export-1',
  name: payload.name,
  columns: rawColumns,
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T01:00:00.000Z',
}

const template = {
  ...dto,
  columns: normalizedColumns,
}

describe('export template API', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('normalizes DTO columns while preserving the first allowed field occurrence', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify([dto]), { status: 200 }))

    await expect(readExportTemplates()).resolves.toEqual([template])
    expect(mockedFetch).toHaveBeenCalledWith('/api/export-templates')
  })

  it('treats missing, invalid, and empty DTO columns as an empty template', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify([
      { ...dto, id: 'missing', columns: undefined },
      { ...dto, id: 'invalid', columns: { field: 'name' } },
      { ...dto, id: 'empty', columns: [] },
    ]), { status: 200 }))

    await expect(readExportTemplates()).resolves.toEqual([
      { ...template, id: 'missing', columns: [] },
      { ...template, id: 'invalid', columns: [] },
      { ...template, id: 'empty', columns: [] },
    ])
  })

  it('normalizes columns for save and update requests and returned DTOs', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(dto), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(dto), { status: 200 }))

    await expect(saveExportTemplate(payload)).resolves.toEqual(template)
    await expect(updateExportTemplate('export-1', payload)).resolves.toEqual(template)

    const requestPayload = JSON.stringify({
      name: payload.name,
      columns: normalizedColumns,
    })
    expect(mockedFetch).toHaveBeenNthCalledWith(1, '/api/export-templates', {
      method: 'POST',
      body: requestPayload,
    })
    expect(mockedFetch).toHaveBeenNthCalledWith(2, '/api/export-templates/export-1', {
      method: 'PUT',
      body: requestPayload,
    })
  })

  it('deletes templates and resolves without a value', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'deleted' }), { status: 200 }))

    await expect(deleteExportTemplate('export-1')).resolves.toBeUndefined()
    expect(mockedFetch).toHaveBeenCalledWith('/api/export-templates/export-1', {
      method: 'DELETE',
    })
  })

  it('rejects list, save, update, and delete failures', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(readExportTemplates()).rejects.toThrow('导出模板加载失败')
    await expect(saveExportTemplate(payload)).rejects.toThrow('保存导出模板失败')
    await expect(updateExportTemplate('missing', payload)).rejects.toThrow('保存导出模板失败')
    await expect(deleteExportTemplate('missing')).rejects.toThrow('删除导出模板失败')
  })
})
