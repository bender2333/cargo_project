import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteExportTemplate,
  readExportTemplates,
  saveExportTemplate,
  updateExportTemplate,
} from '../api/exportTemplates'
import {
  deleteImportTemplate,
  readImportTemplates,
  saveImportTemplate,
  updateImportTemplate,
} from '../api/importTemplates'
import type { ExportTemplate, ImportTemplate } from '../types'
import {
  reconcileSelectedTemplateName,
  shouldClearTemplateReference,
  useTemplateCatalogs,
} from './useTemplateCatalogs'

vi.mock('../api/importTemplates', () => ({
  deleteImportTemplate: vi.fn(),
  readImportTemplates: vi.fn(),
  saveImportTemplate: vi.fn(),
  updateImportTemplate: vi.fn(),
}))

vi.mock('../api/exportTemplates', () => ({
  deleteExportTemplate: vi.fn(),
  readExportTemplates: vi.fn(),
  saveExportTemplate: vi.fn(),
  updateExportTemplate: vi.fn(),
}))

const mockedDeleteImport = vi.mocked(deleteImportTemplate)
const mockedReadImport = vi.mocked(readImportTemplates)
const mockedSaveImport = vi.mocked(saveImportTemplate)
const mockedUpdateImport = vi.mocked(updateImportTemplate)
const mockedDeleteExport = vi.mocked(deleteExportTemplate)
const mockedReadExport = vi.mocked(readExportTemplates)
const mockedSaveExport = vi.mocked(saveExportTemplate)
const mockedUpdateExport = vi.mocked(updateExportTemplate)

const importTemplate: ImportTemplate = {
  id: 'import-1',
  name: 'Warehouse columns',
  mapping: { name: 'Description', length: 'Length', width: 'Width', height: 'Height', quantity: 'Qty' },
  units: { length: 'mm', width: 'mm', height: 'mm' },
  headerRow: 1,
  startRow: 2,
  mergeRows: 'none',
  dimensionMode: 'separate',
  combinedColumn: '',
  dimensionOrder: ['length', 'width', 'height'],
  defaultValues: { canRotate: true, stackable: true },
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
}

const createdImportTemplate: ImportTemplate = {
  ...importTemplate,
  id: 'import-2',
  name: 'Carrier columns',
}

const updatedImportTemplate: ImportTemplate = {
  ...createdImportTemplate,
  name: 'Carrier columns v2',
  updatedAt: '2026-07-23T01:00:00.000Z',
}

const exportTemplate: ExportTemplate = {
  id: 'export-1',
  name: 'Operations sheet',
  columns: [{ field: 'label', header: 'Label' }],
}

const createdExportTemplate: ExportTemplate = {
  id: 'export-2',
  name: 'Customer sheet',
  columns: [{ field: 'name', header: 'Cargo name' }],
}

const updatedExportTemplate: ExportTemplate = {
  ...createdExportTemplate,
  name: 'Customer sheet v2',
  columns: [{ field: 'name', header: 'Description' }],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mockedDeleteImport.mockReset()
  mockedReadImport.mockReset()
  mockedSaveImport.mockReset()
  mockedUpdateImport.mockReset()
  mockedDeleteExport.mockReset()
  mockedReadExport.mockReset()
  mockedSaveExport.mockReset()
  mockedUpdateExport.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTemplateCatalogs', () => {
  it('clears missing references only after a successful catalog read', () => {
    expect(shouldClearTemplateReference('', [], false)).toBe(false)
    expect(shouldClearTemplateReference(importTemplate.id, [importTemplate], false)).toBe(false)
    expect(shouldClearTemplateReference(importTemplate.id, [], true)).toBe(false)
    expect(shouldClearTemplateReference(importTemplate.id, [], false)).toBe(true)
  })

  it('syncs a selected template rename without overwriting a user-authored save-as name', () => {
    const previous = { id: 'import-1', name: 'Warehouse columns' }
    const renamed = { id: 'import-1', name: 'Warehouse columns v2' }

    expect(reconcileSelectedTemplateName('Warehouse columns', previous, renamed)).toBe('Warehouse columns v2')
    expect(reconcileSelectedTemplateName('My save-as copy', previous, renamed)).toBe('My save-as copy')
    expect(reconcileSelectedTemplateName('Warehouse columns', previous, { id: 'import-2', name: 'Carrier columns' })).toBe('Carrier columns')
  })

  it('preserves a save-as name after a failed-load create synchronizes the new canonical template', () => {
    const createdDuringLoadFailure = { id: 'import-b', name: 'Template B' }
    const stateAfterCreate = {
      currentName: createdDuringLoadFailure.name,
      canonical: { ...createdDuringLoadFailure },
    }
    const stateBeforeRetry = { ...stateAfterCreate, currentName: 'Template C' }

    expect(reconcileSelectedTemplateName(
      stateBeforeRetry.currentName,
      stateBeforeRetry.canonical,
      createdDuringLoadFailure,
    )).toBe('Template C')
  })

  it('issues one eager read per catalog when React StrictMode replays effects', async () => {
    mockedReadImport.mockResolvedValue([])
    mockedReadExport.mockResolvedValue([])

    renderHook(() => useTemplateCatalogs(), { wrapper: StrictMode })

    await waitFor(() => {
      expect(mockedReadImport).toHaveBeenCalledTimes(1)
      expect(mockedReadExport).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps catalog failures independent and clears only the retried error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedReadImport
      .mockRejectedValueOnce(new Error('import catalog unavailable'))
      .mockResolvedValueOnce([importTemplate])
    mockedReadExport.mockResolvedValue([exportTemplate])

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => {
      expect(result.current.importLoadFailed).toBe(true)
      expect(result.current.exportTemplates).toEqual([exportTemplate])
      expect(result.current.exportLoadFailed).toBe(false)
    })

    await act(async () => {
      await result.current.refreshImportTemplates()
    })

    expect(result.current.importTemplates).toEqual([importTemplate])
    expect(result.current.importLoadFailed).toBe(false)
    expect(mockedReadExport).toHaveBeenCalledTimes(1)
  })

  it('runs import CRUD through the API and reconciles with authoritative lists', async () => {
    mockedReadImport
      .mockResolvedValueOnce([importTemplate])
      .mockResolvedValueOnce([importTemplate, createdImportTemplate])
      .mockResolvedValueOnce([importTemplate, updatedImportTemplate])
      .mockResolvedValueOnce([updatedImportTemplate])
    mockedReadExport.mockResolvedValue([])
    mockedSaveImport.mockResolvedValue(createdImportTemplate)
    mockedUpdateImport.mockResolvedValue(updatedImportTemplate)
    mockedDeleteImport.mockResolvedValue()

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => expect(result.current.importTemplates).toEqual([importTemplate]))

    await act(async () => {
      await result.current.createImportTemplate({
        name: createdImportTemplate.name,
        mapping: createdImportTemplate.mapping,
        units: createdImportTemplate.units,
      })
    })
    await waitFor(() => expect(result.current.importTemplates).toEqual([importTemplate, createdImportTemplate]))

    await act(async () => {
      await result.current.updateImportTemplate(createdImportTemplate.id, {
        name: updatedImportTemplate.name,
        mapping: updatedImportTemplate.mapping,
        units: updatedImportTemplate.units,
      })
    })
    await waitFor(() => expect(result.current.importTemplates).toEqual([importTemplate, updatedImportTemplate]))

    await act(async () => {
      await result.current.removeImportTemplate(importTemplate.id)
    })
    await waitFor(() => expect(result.current.importTemplates).toEqual([updatedImportTemplate]))

    expect(mockedSaveImport).toHaveBeenCalledTimes(1)
    expect(mockedUpdateImport).toHaveBeenCalledWith(createdImportTemplate.id, expect.objectContaining({ name: updatedImportTemplate.name }))
    expect(mockedDeleteImport).toHaveBeenCalledWith(importTemplate.id)
    expect(mockedReadImport).toHaveBeenCalledTimes(4)
    expect(mockedReadExport).toHaveBeenCalledTimes(1)
  })

  it('runs export CRUD through the API and reconciles with authoritative lists', async () => {
    mockedReadImport.mockResolvedValue([])
    mockedReadExport
      .mockResolvedValueOnce([exportTemplate])
      .mockResolvedValueOnce([exportTemplate, createdExportTemplate])
      .mockResolvedValueOnce([exportTemplate, updatedExportTemplate])
      .mockResolvedValueOnce([updatedExportTemplate])
    mockedSaveExport.mockResolvedValue(createdExportTemplate)
    mockedUpdateExport.mockResolvedValue(updatedExportTemplate)
    mockedDeleteExport.mockResolvedValue()

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => expect(result.current.exportTemplates).toEqual([exportTemplate]))

    await act(async () => {
      await result.current.createExportTemplate({ name: createdExportTemplate.name, columns: createdExportTemplate.columns })
    })
    await waitFor(() => expect(result.current.exportTemplates).toEqual([exportTemplate, createdExportTemplate]))

    await act(async () => {
      await result.current.updateExportTemplate(createdExportTemplate.id, {
        name: updatedExportTemplate.name,
        columns: updatedExportTemplate.columns,
      })
    })
    await waitFor(() => expect(result.current.exportTemplates).toEqual([exportTemplate, updatedExportTemplate]))

    await act(async () => {
      await result.current.removeExportTemplate(exportTemplate.id)
    })
    await waitFor(() => expect(result.current.exportTemplates).toEqual([updatedExportTemplate]))

    expect(mockedSaveExport).toHaveBeenCalledTimes(1)
    expect(mockedUpdateExport).toHaveBeenCalledWith(createdExportTemplate.id, expect.objectContaining({ name: updatedExportTemplate.name }))
    expect(mockedDeleteExport).toHaveBeenCalledWith(exportTemplate.id)
    expect(mockedReadExport).toHaveBeenCalledTimes(4)
    expect(mockedReadImport).toHaveBeenCalledTimes(1)
  })

  it('returns an import create after the local merge without waiting for a slow authoritative read', async () => {
    const authoritativeRead = deferred<ImportTemplate[]>()
    mockedReadImport
      .mockResolvedValueOnce([importTemplate])
      .mockReturnValueOnce(authoritativeRead.promise)
    mockedReadExport.mockResolvedValue([])
    mockedSaveImport.mockResolvedValue(createdImportTemplate)

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => expect(result.current.importTemplates).toEqual([importTemplate]))

    await act(async () => {
      await expect(result.current.createImportTemplate({
        name: createdImportTemplate.name,
        mapping: createdImportTemplate.mapping,
        units: createdImportTemplate.units,
      })).resolves.toEqual(createdImportTemplate)
    })

    expect(result.current.importTemplates).toEqual([createdImportTemplate, importTemplate])
    expect(mockedReadImport).toHaveBeenCalledTimes(2)

    await act(async () => {
      authoritativeRead.resolve([importTemplate, createdImportTemplate])
      await authoritativeRead.promise
    })
    expect(result.current.importTemplates).toEqual([importTemplate, createdImportTemplate])
  })

  it('returns an export delete after the local filter without waiting for a slow authoritative read', async () => {
    const authoritativeRead = deferred<ExportTemplate[]>()
    mockedReadImport.mockResolvedValue([])
    mockedReadExport
      .mockResolvedValueOnce([exportTemplate, createdExportTemplate])
      .mockReturnValueOnce(authoritativeRead.promise)
    mockedDeleteExport.mockResolvedValue()

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => expect(result.current.exportTemplates).toEqual([exportTemplate, createdExportTemplate]))

    await act(async () => {
      await expect(result.current.removeExportTemplate(exportTemplate.id)).resolves.toBe(true)
    })

    expect(result.current.exportTemplates).toEqual([createdExportTemplate])
    expect(mockedReadExport).toHaveBeenCalledTimes(2)

    await act(async () => {
      authoritativeRead.resolve([createdExportTemplate])
      await authoritativeRead.promise
    })
    expect(result.current.exportTemplates).toEqual([createdExportTemplate])
  })

  it('rejects failed writes without changing either catalog or starting a refresh', async () => {
    mockedReadImport.mockResolvedValue([importTemplate])
    mockedReadExport.mockResolvedValue([exportTemplate])
    mockedSaveImport.mockRejectedValue(new Error('import write rejected'))
    mockedUpdateExport.mockRejectedValue(new Error('export write rejected'))

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => {
      expect(result.current.importTemplates).toEqual([importTemplate])
      expect(result.current.exportTemplates).toEqual([exportTemplate])
    })

    await act(async () => {
      await expect(result.current.createImportTemplate({
        name: createdImportTemplate.name,
        mapping: createdImportTemplate.mapping,
        units: createdImportTemplate.units,
      })).rejects.toThrow('import write rejected')
      await expect(result.current.updateExportTemplate(exportTemplate.id, {
        name: updatedExportTemplate.name,
        columns: updatedExportTemplate.columns,
      })).rejects.toThrow('export write rejected')
    })

    expect(result.current.importTemplates).toEqual([importTemplate])
    expect(result.current.exportTemplates).toEqual([exportTemplate])
    expect(mockedReadImport).toHaveBeenCalledTimes(1)
    expect(mockedReadExport).toHaveBeenCalledTimes(1)
  })

  it('keeps the newest import and export refreshes when older successes finish last', async () => {
    const staleImport = deferred<ImportTemplate[]>()
    const staleExport = deferred<ExportTemplate[]>()
    mockedReadImport
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(staleImport.promise)
      .mockResolvedValueOnce([updatedImportTemplate])
    mockedReadExport
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(staleExport.promise)
      .mockResolvedValueOnce([updatedExportTemplate])

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => {
      expect(mockedReadImport).toHaveBeenCalledTimes(1)
      expect(mockedReadExport).toHaveBeenCalledTimes(1)
    })

    let latestImport!: Promise<void>
    let latestExport!: Promise<void>
    act(() => {
      void result.current.refreshImportTemplates()
      latestImport = result.current.refreshImportTemplates()
      void result.current.refreshExportTemplates()
      latestExport = result.current.refreshExportTemplates()
    })
    await act(async () => {
      await Promise.all([latestImport, latestExport])
    })

    await act(async () => {
      staleImport.resolve([importTemplate])
      staleExport.resolve([exportTemplate])
      await Promise.all([staleImport.promise, staleExport.promise])
    })

    expect(result.current.importTemplates).toEqual([updatedImportTemplate])
    expect(result.current.exportTemplates).toEqual([updatedExportTemplate])
    expect(result.current.importLoadFailed).toBe(false)
    expect(result.current.exportLoadFailed).toBe(false)
  })

  it('ignores stale failures after newer catalog reads succeed', async () => {
    const staleImport = deferred<ImportTemplate[]>()
    const staleExport = deferred<ExportTemplate[]>()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedReadImport
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(staleImport.promise)
      .mockResolvedValueOnce([updatedImportTemplate])
    mockedReadExport
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(staleExport.promise)
      .mockResolvedValueOnce([updatedExportTemplate])

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => expect(mockedReadExport).toHaveBeenCalledTimes(1))

    let oldImport!: Promise<void>
    let oldExport!: Promise<void>
    let latestImport!: Promise<void>
    let latestExport!: Promise<void>
    act(() => {
      oldImport = result.current.refreshImportTemplates()
      latestImport = result.current.refreshImportTemplates()
      oldExport = result.current.refreshExportTemplates()
      latestExport = result.current.refreshExportTemplates()
    })
    await act(async () => {
      await Promise.all([latestImport, latestExport])
      staleImport.reject(new Error('stale import failure'))
      staleExport.reject(new Error('stale export failure'))
      await Promise.all([oldImport, oldExport])
    })

    expect(result.current.importLoadFailed).toBe(false)
    expect(result.current.exportLoadFailed).toBe(false)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('keeps a successful write visible when its authoritative refresh fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedReadImport.mockResolvedValue([])
    mockedReadExport
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('export refresh failed'))
    mockedSaveExport.mockResolvedValue(createdExportTemplate)

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => expect(mockedReadExport).toHaveBeenCalledTimes(1))

    await act(async () => {
      await expect(result.current.createExportTemplate({
        name: createdExportTemplate.name,
        columns: createdExportTemplate.columns,
      })).resolves.toEqual(createdExportTemplate)
    })

    await waitFor(() => expect(result.current.exportLoadFailed).toBe(true))
    expect(result.current.exportTemplates).toEqual([createdExportTemplate])
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'export refresh failed' }))
  })

  it('invalidates bootstrap reads when a newer template write commits', async () => {
    const bootstrapImport = deferred<ImportTemplate[]>()
    mockedReadImport
      .mockReturnValueOnce(bootstrapImport.promise)
      .mockResolvedValueOnce([importTemplate, createdImportTemplate])
    mockedReadExport.mockResolvedValue([])
    mockedSaveImport.mockResolvedValue(createdImportTemplate)

    const { result } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => expect(mockedReadImport).toHaveBeenCalledTimes(1))

    await act(async () => {
      await result.current.createImportTemplate({
        name: createdImportTemplate.name,
        mapping: createdImportTemplate.mapping,
        units: createdImportTemplate.units,
      })
    })
    await waitFor(() => expect(result.current.importTemplates).toEqual([importTemplate, createdImportTemplate]))

    await act(async () => {
      bootstrapImport.resolve([importTemplate])
      await bootstrapImport.promise
    })
    expect(result.current.importTemplates).toEqual([importTemplate, createdImportTemplate])
  })

  it('does not start a catalog refresh when a pending write finishes after unmount', async () => {
    const pendingSave = deferred<ImportTemplate>()
    mockedReadImport.mockResolvedValue([])
    mockedReadExport.mockResolvedValue([])
    mockedSaveImport.mockReturnValue(pendingSave.promise)

    const { result, unmount } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => expect(mockedReadImport).toHaveBeenCalledTimes(1))

    let savePromise!: Promise<ImportTemplate | null>
    act(() => {
      savePromise = result.current.createImportTemplate({
        name: createdImportTemplate.name,
        mapping: createdImportTemplate.mapping,
        units: createdImportTemplate.units,
      })
    })
    unmount()

    let savedAfterUnmount: ImportTemplate | null = createdImportTemplate
    await act(async () => {
      pendingSave.resolve(createdImportTemplate)
      savedAfterUnmount = await savePromise
    })

    expect(savedAfterUnmount).toBeNull()
    expect(mockedReadImport).toHaveBeenCalledTimes(1)
    expect(mockedReadExport).toHaveBeenCalledTimes(1)
  })

  it('suppresses a pending write failure after unmount so callers cannot show stale feedback', async () => {
    const pendingSave = deferred<ImportTemplate>()
    mockedReadImport.mockResolvedValue([])
    mockedReadExport.mockResolvedValue([])
    mockedSaveImport.mockReturnValue(pendingSave.promise)

    const { result, unmount } = renderHook(() => useTemplateCatalogs())
    await waitFor(() => expect(mockedReadImport).toHaveBeenCalledTimes(1))

    const savePromise = result.current.createImportTemplate({
      name: createdImportTemplate.name,
      mapping: createdImportTemplate.mapping,
      units: createdImportTemplate.units,
    })
    unmount()

    await act(async () => {
      pendingSave.reject(new Error('session already ended'))
      await expect(savePromise).resolves.toBeNull()
    })
    expect(mockedReadImport).toHaveBeenCalledTimes(1)
  })
})
