import { StrictMode, type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { EXPORT_FIELD_KEYS } from '../lib/exportPlan'
import { parseWorkbookBuffer } from '../lib/importWorkbookBoundary'
import type { ExportTemplate, ImportTemplate } from '../types'
import { ImportTemplateRequestError } from '../api/importTemplates'
import {
  TemplateManagerPage,
  type TemplateManagerLabels,
} from './TemplateManagerPage'

class SampleWorker {
  static nextResponse: 'limit' | 'parse' | null = null
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage(buffer: ArrayBuffer) {
    const response = SampleWorker.nextResponse
    SampleWorker.nextResponse = null
    void Promise.resolve().then(() => {
      if (response) {
        this.onmessage?.(new MessageEvent('message', { data: { ok: false, code: response } }))
        return
      }
      try {
        this.onmessage?.(new MessageEvent('message', { data: { ok: true, rows: parseWorkbookBuffer(buffer) } }))
      } catch {
        this.onerror?.(new ErrorEvent('error', { message: 'sample parse failed' }))
      }
    })
  }

  terminate() {}
}

type PageProps = ComponentProps<typeof TemplateManagerPage>

const labels: TemplateManagerLabels = {
  templateManager: 'Template manager',
  backToWorkbench: 'Back to workbench',
  templateLoadSample: 'Load sample headers',
  templateNew: 'New template',
  templateSampleLoaded: 'Sample columns',
  templateSampleLoadFailed: 'Failed to load sample workbook',
  templateName: 'Template name',
  templateCreate: 'Create template',
  templateUpdate: 'Update template',
  templateEdit: 'Edit',
  templateDelete: 'Delete',
  templateSaved: 'Template saved',
  templateUpdated: 'Template updated',
  templateDeleted: 'Template deleted',
  templateEmpty: 'No import templates yet',
  importTemplateRetry: 'Retry',
  importTemplateLoadFailed: 'Failed to load import templates',
  exportTemplateManager: 'Export templates',
  exportTemplateEmpty: 'No export templates yet',
  exportTemplateRetry: 'Retry',
  exportTemplateLoadFailed: 'Failed to load export templates',
  cancel: 'Cancel',
  templateHeaderRow: 'Header row',
  templateStartRow: 'Start row',
  templateHelpHeaderRow: 'Header row help',
  templateHelpStartRow: 'Start row help',
  templateDefaultLabel: 'Default label',
  templateDefaultQuantity: 'Default quantity',
  templateDefaultColor: 'Default color',
  templateDefaultRotate: 'Default rotate',
  templateDefaultStackable: 'Default stackable',
  templateDefaultMaxStackLayers: 'Default max stack layers',
  templateDefaultGroundOnly: 'Default ground only',
  templateDimensionMode: 'Dimension mode',
  templateHelpDimensionMode: 'Dimension mode help',
  templateDimensionSeparate: 'Separate',
  templateDimensionCombined: 'Combined',
  templateCombinedColumn: 'Combined column',
  templateHelpCombinedColumn: 'Combined column help',
  templateDimensionOrder: 'Dimension order',
  templateDimensionOrderLWH: 'LWH',
  templateDimensionOrderLHW: 'LHW',
  templateDimensionOrderWLH: 'WLH',
  templateDimensionOrderWHL: 'WHL',
  templateDimensionOrderHLW: 'HLW',
  templateDimensionOrderHWL: 'HWL',
  templateHelpLabelColumn: 'Label column help',
  mappingSelectColumn: 'Select column',
  mappingFieldLabel: 'Label',
  mappingFieldName: 'Name',
  mappingFieldLength: 'Length',
  mappingFieldWidth: 'Width',
  mappingFieldHeight: 'Height',
  mappingFieldWeight: 'Weight',
  mappingFieldQuantity: 'Quantity',
  mappingFieldGroundOnly: 'Ground only',
  color: 'Color',
  rotate: 'Rotate',
  stackable: 'Stackable',
  groundOnly: 'Ground only',
  maxStackLayers: 'Max stack layers',
  mappingUnit: 'Unit',
  mappingAutoUnit: 'Auto',
  mappingConvertHint: 'Convert cm to mm',
  mappingRequiredMarkerHint: '* marks fields required to complete the current configuration',
  mappingRequiredField: 'Required',
  templateNameRequired: 'Enter a template name',
  templateNameDuplicate: 'A template with this name already exists',
  templateConfigInvalid: 'Template configuration is incomplete or has mapping conflicts',
  templateSaveFailed: 'Failed to save template',
  exportColumnHeader: 'Column header',
  exportColumnUnit: 'Unit',
  exportAddColumn: 'Add column',
  exportNoColumns: 'No columns selected',
}

const importA: ImportTemplate = {
  id: 'import-a',
  name: 'Import A',
  mapping: {
    label: 'SKU',
    name: 'Goods',
    dimensions: 'Legacy dimensions',
    weight: 'Weight',
    quantity: 'Qty',
  },
  units: { length: 'mm', width: 'mm', height: 'mm' },
  headerRow: 2,
  startRow: 3,
  mergeRows: 'none',
  dimensionMode: 'combined',
  combinedColumn: '',
  dimensionOrder: ['length', 'width', 'height'],
  defaultValues: { quantity: 1, canRotate: true, stackable: true },
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T01:00:00.000Z',
}

const importB: ImportTemplate = {
  ...importA,
  id: 'import-b',
  name: 'Import B',
  mapping: {
    label: 'Code',
    name: 'Description',
    length: 'L',
    width: 'W',
    height: 'H',
  },
  headerRow: 1,
  startRow: 2,
  dimensionMode: 'separate',
  combinedColumn: '',
}

const exportA: ExportTemplate = {
  id: 'export-a',
  name: 'Export A',
  columns: [
    { field: 'label', header: 'Tag' },
    { field: 'name', header: 'Goods' },
    { field: 'originalLength', header: 'Length', unit: 'mm' },
  ],
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T01:00:00.000Z',
}

const exportB: ExportTemplate = {
  ...exportA,
  id: 'export-b',
  name: 'Export B',
  columns: [
    { field: 'label', header: 'Label B' },
    { field: 'weight', header: 'Weight B' },
  ],
}

function props(overrides: Partial<PageProps> = {}): PageProps {
  return {
    locale: 'en',
    labels,
    importTemplates: [],
    importLoadFailed: false,
    exportTemplates: [],
    exportLoadFailed: false,
    onRetryImport: vi.fn(async () => undefined),
    onCreateImport: vi.fn(async () => null),
    onUpdateImport: vi.fn(async () => null),
    onDeleteImport: vi.fn(async () => false),
    onRetryExport: vi.fn(async () => undefined),
    onCreateExport: vi.fn(async () => null),
    onUpdateExport: vi.fn(async () => null),
    onDeleteExport: vi.fn(async () => false),
    onBack: vi.fn(),
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function workbookBuffer(headers: string[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers]), 'Cargo')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
}

function fileWithArrayBuffer(name: string, read: () => Promise<ArrayBuffer>): File {
  const file = new File([], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  Object.defineProperty(file, 'arrayBuffer', { value: read })
  return file
}

function fillRequiredSeparateMapping(view: { getByTestId: (id: string) => HTMLElement }, prefix: string) {
  fireEvent.change(view.getByTestId(`${prefix}map-select-length`), { target: { value: 'L' } })
  fireEvent.change(view.getByTestId(`${prefix}map-select-width`), { target: { value: 'W' } })
  fireEvent.change(view.getByTestId(`${prefix}map-select-height`), { target: { value: 'H' } })
}

function hasRequiredMarker(label: HTMLElement | null, requiredText: string) {
  if (!label) return false
  const visualStar = [...label.querySelectorAll('span[aria-hidden="true"]')].some((node) => node.textContent === '*')
  const accessible = [...label.querySelectorAll('.sr-only')].some((node) => node.textContent === requiredText)
  return visualStar && accessible
}

beforeEach(() => {
  vi.stubGlobal('Worker', SampleWorker)
  SampleWorker.nextResponse = null
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TemplateManagerPage', () => {
  it('keeps empty and failed loads distinct and exposes retry and back actions', () => {
    const onRetryImport = vi.fn(async () => undefined)
    const onRetryExport = vi.fn(async () => undefined)
    const onBack = vi.fn()
    const pageProps = props({ onRetryImport, onRetryExport, onBack })
    const view = render(<TemplateManagerPage {...pageProps} />)

    expect(view.getByTestId('template-manager-empty-state')).toBeTruthy()
    expect(view.getByTestId('export-template-empty-state')).toBeTruthy()

    view.rerender(
      <TemplateManagerPage
        {...pageProps}
        importLoadFailed
        exportLoadFailed
      />,
    )

    const importError = view.getByTestId('import-template-load-error')
    const exportError = view.getByTestId('export-template-load-error')
    expect(view.queryByTestId('template-manager-empty-state')).toBeNull()
    expect(view.queryByTestId('export-template-empty-state')).toBeNull()
    fireEvent.click(within(importError).getByRole('button', { name: 'Retry' }))
    fireEvent.click(within(exportError).getByRole('button', { name: 'Retry' }))
    fireEvent.click(view.getByRole('button', { name: 'Back to workbench' }))

    expect(onRetryImport).toHaveBeenCalledTimes(1)
    expect(onRetryExport).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('keeps the newest sample headers when files finish out of order and clears a failed sample', async () => {
    const firstRead = deferred<ArrayBuffer>()
    const secondRead = deferred<ArrayBuffer>()
    const firstFile = fileWithArrayBuffer('first.xlsx', () => firstRead.promise)
    const secondFile = fileWithArrayBuffer('second.xlsx', () => secondRead.promise)
    const badFile = fileWithArrayBuffer('bad.xlsx', async () => {
      throw new Error('bad workbook')
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(<TemplateManagerPage {...props()} />)
    fireEvent.click(view.getByTestId('template-manager-new'))
    const sampleInput = view.getByTestId('template-manager-sample-input')

    fireEvent.change(sampleInput, { target: { files: [firstFile] } })
    fireEvent.change(sampleInput, { target: { files: [secondFile] } })
    await act(async () => {
      secondRead.resolve(workbookBuffer(['Second SKU', 'Second name']))
      await secondRead.promise
    })

    await waitFor(() => expect(view.getByTestId('template-manager-sample-status').textContent).toContain('2'))
    expect(view.container.querySelector('datalist#tm-new-map-options-name option[value="Second name"]')).toBeTruthy()

    await act(async () => {
      firstRead.resolve(workbookBuffer(['Stale SKU']))
      await firstRead.promise
    })
    expect(view.getByTestId('template-manager-sample-status').textContent).toContain('2')
    expect(view.container.querySelector('datalist#tm-new-map-options-name option[value="Stale SKU"]')).toBeNull()

    fireEvent.change(sampleInput, { target: { files: [badFile] } })
    await waitFor(() => expect(view.queryByTestId('template-manager-sample-status')).toBeNull())
    expect(consoleError).toHaveBeenCalledWith('[template-sample]', expect.any(Error))
  })

  it('clears sample rows and exposes a visible error when the worker rejects the workbook', async () => {
    SampleWorker.nextResponse = 'limit'
    const view = render(<TemplateManagerPage {...props()} />)
    fireEvent.click(view.getByTestId('template-manager-new'))
    const sampleInput = view.getByTestId('template-manager-sample-input')
    const file = fileWithArrayBuffer('limited.xlsx', async () => workbookBuffer(['SKU']))

    fireEvent.change(sampleInput, { target: { files: [file] } })

    await waitFor(() => expect(view.getByTestId('template-manager-sample-error').textContent).toContain('Failed to load sample workbook'))
    expect(view.queryByTestId('template-manager-sample-status')).toBeNull()
  })

  it('uses the latest locale when an in-flight sample request fails', async () => {
    const sampleRead = deferred<ArrayBuffer>()
    const file = fileWithArrayBuffer('locale.xlsx', () => sampleRead.promise)
    const view = render(<TemplateManagerPage {...props()} />)
    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-sample-input'), { target: { files: [file] } })

    const localizedLabels = { ...labels, templateSampleLoadFailed: '样本加载失败' }
    view.rerender(<TemplateManagerPage {...props({ labels: localizedLabels })} />)
    await act(async () => {
      sampleRead.reject(new Error('late sample failure'))
      await sampleRead.promise.catch(() => undefined)
    })

    await waitFor(() => {
      expect(view.getByTestId('template-manager-sample-error').textContent).toBe('样本加载失败')
      expect(view.getByTestId('template-manager-sample-error').getAttribute('role')).toBe('alert')
    })
  })

  it('creates a trimmed import template with complete mapping metadata and combined-column fallback', async () => {
    const saved: ImportTemplate = {
      ...importA,
      id: 'created-import',
      name: 'Combined import',
    }
    const onCreateImport = vi.fn(async () => saved)
    const view = render(
      <TemplateManagerPage {...props({ onCreateImport })} />,
    )

    fireEvent.click(view.getByTestId('template-manager-new'))
    expect((view.getByTestId('template-manager-new-save') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('tm-new-template-header-row') as HTMLInputElement).value).toBe('1')
    expect((view.getByTestId('tm-new-template-start-row') as HTMLInputElement).value).toBe('2')
    expect((view.getByTestId('tm-new-template-default-quantity') as HTMLInputElement).value).toBe('1')
    expect(view.queryByTestId('tm-new-template-default-weight')).toBeNull()
    expect((view.getByTestId('tm-new-template-default-rotate') as HTMLInputElement).checked).toBe(true)
    expect((view.getByTestId('tm-new-template-default-stackable') as HTMLInputElement).checked).toBe(true)
    expect((view.getByTestId('tm-new-template-dimension-mode') as HTMLSelectElement).value).toBe('separate')

    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: '  Combined import  ' } })
    const completeMapping = {
      label: 'SKU',
      name: 'Goods',
      length: 'L',
      width: 'W',
      height: 'H',
      weight: 'Gross weight',
      quantity: 'Cartons',
      color: 'Color',
      canRotate: 'Rotate',
      stackable: 'Stackable',
      maxStackLayers: 'Stack limit',
      groundOnly: 'Ground only',
    }
    Object.entries(completeMapping).forEach(([field, value]) => {
      fireEvent.change(view.getByTestId(`tm-new-map-select-${field}`), { target: { value } })
    })
    fireEvent.change(view.getByTestId('tm-new-map-unit-length'), { target: { value: 'cm' } })
    fireEvent.change(view.getByTestId('tm-new-map-unit-width'), { target: { value: 'mm' } })
    fireEvent.change(view.getByTestId('tm-new-map-unit-height'), { target: { value: 'auto' } })
    fireEvent.change(view.getByTestId('tm-new-template-header-row'), { target: { value: '2' } })
    fireEvent.change(view.getByTestId('tm-new-template-start-row'), { target: { value: '4' } })
    fireEvent.change(view.getByTestId('tm-new-template-default-label'), { target: { value: 'BX' } })
    fireEvent.change(view.getByTestId('tm-new-template-default-quantity'), { target: { value: '4' } })
    fireEvent.change(view.getByTestId('tm-new-template-default-color'), { target: { value: '#ef4444' } })
    fireEvent.click(view.getByTestId('tm-new-template-default-rotate'))
    fireEvent.change(view.getByTestId('tm-new-template-default-max-stack-layers'), { target: { value: '3' } })
    fireEvent.click(view.getByTestId('tm-new-template-default-ground-only'))
    fireEvent.change(view.getByTestId('tm-new-template-dimension-mode'), { target: { value: 'combined' } })
    fireEvent.change(view.getByTestId('tm-new-template-combined-column'), { target: { value: 'Dimensions' } })
    fireEvent.change(view.getByTestId('tm-new-template-dimension-order'), { target: { value: 'width,length,height' } })
    fireEvent.click(view.getByTestId('template-manager-new-save'))

    await waitFor(() => expect(view.queryByTestId('template-manager-new-form')).toBeNull())
    expect(onCreateImport).toHaveBeenCalledWith({
      name: 'Combined import',
      mapping: {
        ...completeMapping,
        dimensions: 'Dimensions',
      },
      units: { length: 'cm', width: 'mm', height: 'auto' },
      headerRow: 2,
      startRow: 4,
      mergeRows: 'none',
      dimensionMode: 'combined',
      combinedColumn: 'Dimensions',
      dimensionOrder: ['width', 'length', 'height'],
      defaultValues: {
        quantity: 4,
        canRotate: false,
        stackable: true,
        label: 'BX',
        color: '#ef4444',
        maxStackLayers: 3,
        groundOnly: true,
      },
    })
    expect(view.queryByTestId('template-manager-new-form')).toBeNull()
    expect(view.getByText('Template saved: Combined import')).toBeTruthy()
  })

  it('creates an export template from every default field after column edits', async () => {
    const saved: ExportTemplate = {
      id: 'created-export',
      name: 'Operational export',
      columns: [],
    }
    const onCreateExport = vi.fn(async () => saved)
    const view = render(
      <TemplateManagerPage {...props({ onCreateExport })} />,
    )

    fireEvent.click(view.getByTestId('export-template-new'))
    EXPORT_FIELD_KEYS.forEach((field) => {
      expect(view.getByTestId(`ex-new-export-col-${field}`)).toBeTruthy()
    })
    expect(view.queryByTestId('ex-new-export-col-add')).toBeNull()
    expect((view.getByTestId('export-template-new-save') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(view.getByTestId('export-template-new-name'), { target: { value: '  Operational export  ' } })
    fireEvent.change(view.getByTestId('ex-new-export-col-header-name'), { target: { value: 'Goods' } })
    fireEvent.change(view.getByTestId('ex-new-export-col-unit-originalLength'), { target: { value: 'cm' } })
    fireEvent.click(view.getByTestId('ex-new-export-col-down-label'))
    fireEvent.click(view.getByTestId('ex-new-export-col-remove-weight'))
    expect(view.getByTestId('ex-new-export-col-add')).toBeTruthy()
    fireEvent.click(view.getByTestId('export-template-new-save'))

    await waitFor(() => expect(view.queryByTestId('export-template-new-form')).toBeNull())
    const reordered = [...EXPORT_FIELD_KEYS]
    const first = reordered[0]
    reordered[0] = reordered[1]
    reordered[1] = first
    const expectedColumns = reordered
      .filter((field) => field !== 'weight')
      .map((field) => ({
        field,
        header: field === 'name' ? 'Goods' : field,
        ...(field === 'originalLength' ? { unit: 'cm' as const } : {}),
      }))
    expect(onCreateExport).toHaveBeenCalledWith({
      name: 'Operational export',
      columns: expectedColumns,
    })
    expect(view.queryByTestId('export-template-new-form')).toBeNull()
    expect(view.getByText('Template saved: Operational export')).toBeTruthy()
  })

  it('locks duplicate create and delete actions while their requests are pending', async () => {
    const pendingCreate = deferred<ImportTemplate | null>()
    const pendingDelete = deferred<boolean>()
    const onCreateImport = vi.fn(() => pendingCreate.promise)
    const onDeleteExport = vi.fn(() => pendingDelete.promise)
    const view = render(
      <TemplateManagerPage
        {...props({ exportTemplates: [exportA], onCreateImport, onDeleteExport })}
      />,
    )

    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: 'One import' } })
    fillRequiredSeparateMapping(view, 'tm-new-')
    const createButton = view.getByTestId('template-manager-new-save') as HTMLButtonElement
    fireEvent.click(createButton)
    fireEvent.click(createButton)

    const deleteButton = view.getByTestId('export-template-delete-export-a') as HTMLButtonElement
    fireEvent.click(deleteButton)
    fireEvent.click(deleteButton)

    expect(onCreateImport).toHaveBeenCalledTimes(1)
    expect(onDeleteExport).toHaveBeenCalledTimes(1)
    expect(createButton.disabled).toBe(true)
    expect(deleteButton.disabled).toBe(true)

    await act(async () => {
      pendingCreate.resolve({ ...importA, id: 'one-import', name: 'One import' })
      pendingDelete.resolve(true)
      await Promise.all([pendingCreate.promise, pendingDelete.promise])
    })
  })

  it('lets only the newest operation publish page feedback', async () => {
    const pendingImport = deferred<ImportTemplate | null>()
    const pendingExport = deferred<ExportTemplate | null>()
    const onCreateImport = vi.fn(() => pendingImport.promise)
    const onCreateExport = vi.fn(() => pendingExport.promise)
    const view = render(
      <TemplateManagerPage {...props({ onCreateImport, onCreateExport })} />,
    )

    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: 'Older import' } })
    fillRequiredSeparateMapping(view, 'tm-new-')
    fireEvent.click(view.getByTestId('template-manager-new-save'))
    fireEvent.click(view.getByTestId('export-template-new'))
    fireEvent.change(view.getByTestId('export-template-new-name'), { target: { value: 'Newer export' } })
    fireEvent.click(view.getByTestId('export-template-new-save'))

    await act(async () => {
      pendingExport.resolve({ ...exportA, id: 'newer-export', name: 'Newer export' })
      await pendingExport.promise
    })
    expect(view.getByText('Template saved: Newer export')).toBeTruthy()

    await act(async () => {
      pendingImport.resolve({ ...importA, id: 'older-import', name: 'Older import' })
      await pendingImport.promise
    })
    expect(view.getByText('Template saved: Newer export')).toBeTruthy()
    expect(view.queryByText('Template saved: Older import')).toBeNull()
  })

  it('cancels import edits and preserves a failed update draft with the legacy combined-column fallback', async () => {
    const onUpdateImport = vi.fn().mockRejectedValue(
      new ImportTemplateRequestError('Template name already exists', 409, 'duplicate-name'),
    )
    const view = render(
      <TemplateManagerPage
        {...props({ importTemplates: [importA], onUpdateImport })}
      />,
    )
    const row = view.getByTestId('template-manager-row-import-a')

    fireEvent.click(view.getByTestId('template-manager-edit-import-a'))
    expect((view.getByTestId('tm-edit-import-a-template-combined-column') as HTMLInputElement).value).toBe('Legacy dimensions')
    fireEvent.change(view.getByTestId('template-manager-name-import-a'), { target: { value: 'Discarded name' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
    expect(view.queryByTestId('template-manager-name-import-a')).toBeNull()
    expect(row.textContent).toContain('Import A')
    expect(onUpdateImport).not.toHaveBeenCalled()

    fireEvent.click(view.getByTestId('template-manager-edit-import-a'))
    fireEvent.change(view.getByTestId('template-manager-name-import-a'), { target: { value: '  Rejected rename  ' } })
    fireEvent.click(view.getByTestId('template-manager-save-import-a'))

    await waitFor(() => expect(view.getByTestId('template-manager-error-import-a').textContent).toBe(labels.templateNameDuplicate))
    expect(onUpdateImport).toHaveBeenCalledWith(
      'import-a',
      expect.objectContaining({
        name: 'Rejected rename',
        combinedColumn: 'Legacy dimensions',
        mapping: expect.objectContaining({ dimensions: 'Legacy dimensions' }),
      }),
    )
    expect((view.getByTestId('template-manager-name-import-a') as HTMLInputElement).value).toBe('  Rejected rename  ')
    expect(view.queryByText(`Template updated: Rejected rename`)).toBeNull()
  })

  it('cancels export edits and keeps the changed columns visible when update fails', async () => {
    const alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onUpdateExport = vi.fn().mockRejectedValue(new Error('update failed'))
    const view = render(
      <TemplateManagerPage
        {...props({ exportTemplates: [exportA], onUpdateExport })}
      />,
    )
    const row = view.getByTestId('export-template-row-export-a')

    fireEvent.click(view.getByTestId('export-template-edit-export-a'))
    fireEvent.change(view.getByTestId('export-template-name-export-a'), { target: { value: 'Discarded export name' } })
    fireEvent.change(view.getByTestId('ex-edit-export-a-export-col-header-label'), { target: { value: 'Discarded tag' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
    expect(view.queryByTestId('export-template-name-export-a')).toBeNull()
    expect(row.textContent).toContain('Export A')
    expect(row.textContent).toContain('Tag')
    expect(onUpdateExport).not.toHaveBeenCalled()

    fireEvent.click(view.getByTestId('export-template-edit-export-a'))
    fireEvent.change(view.getByTestId('export-template-name-export-a'), { target: { value: '  Rejected export  ' } })
    fireEvent.change(view.getByTestId('ex-edit-export-a-export-col-header-label'), { target: { value: 'Rejected tag' } })
    fireEvent.click(view.getByTestId('export-template-save-export-a'))

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Failed to update export template'))
    expect(onUpdateExport).toHaveBeenCalledWith('export-a', {
      name: 'Rejected export',
      columns: [
        { field: 'label', header: 'Rejected tag' },
        { field: 'name', header: 'Goods' },
        { field: 'originalLength', header: 'Length', unit: 'mm' },
      ],
    })
    expect((view.getByTestId('export-template-name-export-a') as HTMLInputElement).value).toBe('  Rejected export  ')
    expect((view.getByTestId('ex-edit-export-a-export-col-header-label') as HTMLInputElement).value).toBe('Rejected tag')
  })

  it('keeps rows visible when import or export deletion fails', async () => {
    const alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onDeleteImport = vi.fn().mockRejectedValue(new Error('import delete failed'))
    const onDeleteExport = vi.fn().mockRejectedValue(new Error('export delete failed'))
    const view = render(
      <TemplateManagerPage
        {...props({
          importTemplates: [importA],
          exportTemplates: [exportA],
          onDeleteImport,
          onDeleteExport,
        })}
      />,
    )

    fireEvent.click(view.getByTestId('template-manager-delete-import-a'))
    fireEvent.click(view.getByTestId('export-template-delete-export-a'))

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('Failed to delete template')
      expect(alertMock).toHaveBeenCalledWith('Failed to delete export template')
    })
    expect(view.getByTestId('template-manager-row-import-a')).toBeTruthy()
    expect(view.getByTestId('export-template-row-export-a')).toBeTruthy()
  })

  it('drops edit drafts whose templates disappear from authoritative props', () => {
    const pageProps = props({
      importTemplates: [importA, importB],
      exportTemplates: [exportA, exportB],
    })
    const view = render(<TemplateManagerPage {...pageProps} />)

    fireEvent.click(view.getByTestId('template-manager-edit-import-a'))
    fireEvent.click(view.getByTestId('export-template-edit-export-a'))
    expect(view.getByTestId('template-manager-name-import-a')).toBeTruthy()
    expect(view.getByTestId('export-template-name-export-a')).toBeTruthy()

    view.rerender(
      <TemplateManagerPage
        {...pageProps}
        importTemplates={[importB]}
        exportTemplates={[exportB]}
      />,
    )
    view.rerender(<TemplateManagerPage {...pageProps} />)

    expect(view.queryByTestId('template-manager-name-import-a')).toBeNull()
    expect(view.queryByTestId('export-template-name-export-a')).toBeNull()
    expect(view.getByTestId('template-manager-edit-import-a')).toBeTruthy()
    expect(view.getByTestId('export-template-edit-export-a')).toBeTruthy()
  })

  it('accepts deferred CRUD success after StrictMode replays the mount effect', async () => {
    const pendingCreate = deferred<ImportTemplate | null>()
    const onCreateImport = vi.fn(() => pendingCreate.promise)
    const view = render(
      <StrictMode>
        <TemplateManagerPage
          {...props({ onCreateImport })}
        />
      </StrictMode>,
    )

    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: 'Strict deferred import' } })
    fillRequiredSeparateMapping(view, 'tm-new-')
    fireEvent.click(view.getByTestId('template-manager-new-save'))

    const saved = { ...importA, id: 'strict-import', name: 'Strict deferred import' }
    await act(async () => {
      pendingCreate.resolve(saved)
      await pendingCreate.promise
    })

    expect(view.queryByTestId('template-manager-new-form')).toBeNull()
    expect(view.getByText('Template saved: Strict deferred import')).toBeTruthy()
  })

  it('does not clear a later import B edit when the pending save of import A completes', async () => {
    const pendingUpdate = deferred<ImportTemplate | null>()
    const onUpdateImport = vi.fn(() => pendingUpdate.promise)
    const view = render(
      <TemplateManagerPage
        {...props({
          importTemplates: [importA, importB],
          onUpdateImport,
        })}
      />,
    )

    fireEvent.click(view.getByTestId('template-manager-edit-import-a'))
    fireEvent.change(view.getByTestId('template-manager-name-import-a'), { target: { value: 'Saved Import A' } })
    fireEvent.click(view.getByTestId('template-manager-save-import-a'))
    expect(onUpdateImport).toHaveBeenCalledTimes(1)
    fireEvent.click(view.getByTestId('template-manager-edit-import-b'))

    const savedA = { ...importA, name: 'Saved Import A' }
    await act(async () => {
      pendingUpdate.resolve(savedA)
      await pendingUpdate.promise
    })

    expect((view.getByTestId('template-manager-name-import-b') as HTMLInputElement).value).toBe('Import B')
    expect(view.queryByTestId('template-manager-name-import-a')).toBeNull()
  })

  it('does not clear a later export B edit when the pending deletion of export A completes', async () => {
    const pendingDelete = deferred<boolean>()
    const onDeleteExport = vi.fn(() => pendingDelete.promise)
    const view = render(
      <TemplateManagerPage
        {...props({
          exportTemplates: [exportA, exportB],
          onDeleteExport,
        })}
      />,
    )

    fireEvent.click(view.getByTestId('export-template-delete-export-a'))
    expect(onDeleteExport).toHaveBeenCalledWith('export-a')
    fireEvent.click(view.getByTestId('export-template-edit-export-b'))

    await act(async () => {
      pendingDelete.resolve(true)
      await pendingDelete.promise
    })

    expect((view.getByTestId('export-template-name-export-b') as HTMLInputElement).value).toBe('Export B')
  })

  it('does not publish failure alerts after unmount', async () => {
    const pendingCreate = deferred<ImportTemplate | null>()
    const pendingDelete = deferred<boolean>()
    const pendingUpdate = deferred<ExportTemplate | null>()
    const onCreateImport = vi.fn(() => pendingCreate.promise)
    const onDeleteExport = vi.fn(() => pendingDelete.promise)
    const onUpdateExport = vi.fn(() => pendingUpdate.promise)
    const alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(
      <TemplateManagerPage
        {...props({
          exportTemplates: [exportA, exportB],
          onCreateImport,
          onDeleteExport,
          onUpdateExport,
        })}
      />,
    )

    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: 'Pending import' } })
    fillRequiredSeparateMapping(view, 'tm-new-')
    fireEvent.click(view.getByTestId('template-manager-new-save'))
    fireEvent.click(view.getByTestId('export-template-delete-export-a'))
    fireEvent.click(view.getByTestId('export-template-edit-export-b'))
    fireEvent.change(view.getByTestId('export-template-name-export-b'), { target: { value: 'Pending export update' } })
    fireEvent.click(view.getByTestId('export-template-save-export-b'))
    expect(onCreateImport).toHaveBeenCalledTimes(1)
    expect(onDeleteExport).toHaveBeenCalledTimes(1)
    expect(onUpdateExport).toHaveBeenCalledTimes(1)

    view.unmount()
    await act(async () => {
      pendingCreate.resolve({ ...importA, id: 'pending-import', name: 'Pending import' })
      pendingDelete.resolve(true)
      pendingUpdate.reject(new Error('late export failure'))
      await Promise.allSettled([
        pendingCreate.promise,
        pendingDelete.promise,
        pendingUpdate.promise,
      ])
    })

    expect(alertMock).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('does not create a named template that is missing dimension mappings', () => {
    const onCreateImport = vi.fn()
    const view = render(<TemplateManagerPage {...props({ onCreateImport })} />)

    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: 'Dimensions missing' } })
    const save = view.getByTestId('template-manager-new-save') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    expect(onCreateImport).not.toHaveBeenCalled()
    expect(view.getByTestId('template-manager-new-form')).toBeTruthy()
  })

  it('marks template name as required for create and edit and blocks an empty update name', () => {
    const onUpdateImport = vi.fn()
    const view = render(
      <TemplateManagerPage {...props({ importTemplates: [importB], onUpdateImport })} />,
    )

    fireEvent.click(view.getByTestId('template-manager-new'))
    const newNameLabel = view.getByTestId('template-manager-new-name').closest('label')
    expect(hasRequiredMarker(newNameLabel, labels.mappingRequiredField)).toBe(true)

    fireEvent.click(view.getByTestId('template-manager-edit-import-b'))
    const editName = view.getByTestId('template-manager-name-import-b') as HTMLInputElement
    const editNameLabel = editName.closest('label')
    expect(hasRequiredMarker(editNameLabel, labels.mappingRequiredField)).toBe(true)

    fireEvent.change(editName, { target: { value: '   ' } })
    const update = view.getByTestId('template-manager-save-import-b') as HTMLButtonElement
    expect(update.disabled).toBe(true)
    fireEvent.click(update)
    expect(onUpdateImport).not.toHaveBeenCalled()
  })

  it('marks both target fields when a source column is reused and blocks save', () => {
    const onCreateImport = vi.fn()
    const view = render(<TemplateManagerPage {...props({ onCreateImport })} />)

    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: 'Conflicted' } })
    fireEvent.change(view.getByTestId('tm-new-map-select-length'), { target: { value: 'W' } })
    fireEvent.change(view.getByTestId('tm-new-map-select-width'), { target: { value: 'W' } })
    fireEvent.change(view.getByTestId('tm-new-map-select-height'), { target: { value: 'H' } })

    expect(view.getByTestId('tm-new-map-select-length').getAttribute('data-invalid')).toBe('true')
    expect(view.getByTestId('tm-new-map-select-width').getAttribute('data-invalid')).toBe('true')
    expect(view.getByTestId('tm-new-map-select-height').hasAttribute('data-invalid')).toBe(false)

    const save = view.getByTestId('template-manager-new-save') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    expect(onCreateImport).not.toHaveBeenCalled()
  })

  it('saves a valid template without a weight mapping', async () => {
    const saved: ImportTemplate = { ...importB, id: 'no-weight', name: 'No weight' }
    const onCreateImport = vi.fn(async () => saved)
    const view = render(<TemplateManagerPage {...props({ onCreateImport })} />)

    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: 'No weight' } })
    fillRequiredSeparateMapping(view, 'tm-new-')
    expect((view.getByTestId('tm-new-map-select-weight') as HTMLInputElement).value).toBe('')
    fireEvent.click(view.getByTestId('template-manager-new-save'))

    await waitFor(() => expect(onCreateImport).toHaveBeenCalledTimes(1))
    expect(onCreateImport).toHaveBeenCalledWith(expect.objectContaining({
      name: 'No weight',
      mapping: expect.objectContaining({ length: 'L', width: 'W', height: 'H', weight: '' }),
    }))
    expect(view.queryByTestId('mapping-modal')).toBeNull()
    expect(view.queryByTestId('cargo-import-dialog')).toBeNull()
  })

  it('does not PUT an edited template after the mapping becomes invalid', () => {
    const onUpdateImport = vi.fn()
    const view = render(
      <TemplateManagerPage {...props({ importTemplates: [importB], onUpdateImport })} />,
    )

    fireEvent.click(view.getByTestId('template-manager-edit-import-b'))
    fireEvent.change(view.getByTestId('tm-edit-import-b-map-select-length'), { target: { value: '' } })
    const save = view.getByTestId('template-manager-save-import-b') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    expect(onUpdateImport).not.toHaveBeenCalled()
  })

  it('keeps create and edit drafts after a catalog duplicate name and an API 409', async () => {
    const onCreateImport = vi.fn()
    const onUpdateImport = vi.fn().mockRejectedValue(
      new ImportTemplateRequestError('Template name already exists', 409, 'duplicate-name'),
    )
    const view = render(
      <TemplateManagerPage
        {...props({
          importTemplates: [importA, importB],
          onCreateImport,
          onUpdateImport,
        })}
      />,
    )

    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: '  Import A  ' } })
    fillRequiredSeparateMapping(view, 'tm-new-')
    fireEvent.click(view.getByTestId('template-manager-new-save'))
    expect(onCreateImport).not.toHaveBeenCalled()
    expect(view.getByTestId('template-manager-new-error').textContent).toBe(labels.templateNameDuplicate)
    expect((view.getByTestId('template-manager-new-name') as HTMLInputElement).value).toBe('  Import A  ')
    expect((view.getByTestId('tm-new-map-select-length') as HTMLInputElement).value).toBe('L')

    fireEvent.click(view.getByTestId('template-manager-edit-import-b'))
    fireEvent.change(view.getByTestId('template-manager-name-import-b'), { target: { value: 'Unique rename' } })
    fireEvent.click(view.getByTestId('template-manager-save-import-b'))
    await waitFor(() => expect(view.getByTestId('template-manager-error-import-b').textContent).toBe(labels.templateNameDuplicate))
    expect(onUpdateImport).toHaveBeenCalledTimes(1)
    expect((view.getByTestId('template-manager-name-import-b') as HTMLInputElement).value).toBe('Unique rename')
    expect(view.getByTestId('template-manager-error-import-b').textContent).not.toBe('Template updated: Unique rename')
    expect(view.queryByTestId('mapping-modal')).toBeNull()
  })

  it('shows localized 400 and network errors in the draft instead of a success notice', async () => {
    const onCreateImport = vi.fn()
      .mockRejectedValueOnce(new ImportTemplateRequestError('Invalid template', 400, 'invalid-template'))
      .mockRejectedValueOnce(new Error('network down'))
    const view = render(<TemplateManagerPage {...props({ onCreateImport })} />)

    fireEvent.click(view.getByTestId('template-manager-new'))
    fireEvent.change(view.getByTestId('template-manager-new-name'), { target: { value: 'Solo' } })
    fillRequiredSeparateMapping(view, 'tm-new-')

    fireEvent.click(view.getByTestId('template-manager-new-save'))
    await waitFor(() => expect(view.getByTestId('template-manager-new-error').textContent).toBe(labels.templateConfigInvalid))
    expect((view.getByTestId('template-manager-new-name') as HTMLInputElement).value).toBe('Solo')
    expect(view.queryByText('Template saved: Solo')).toBeNull()

    fireEvent.click(view.getByTestId('template-manager-new-save'))
    await waitFor(() => expect(view.getByTestId('template-manager-new-error').textContent).toBe(labels.templateSaveFailed))
    expect(view.getByTestId('template-manager-new-form')).toBeTruthy()
    expect(view.queryByTestId('mapping-modal')).toBeNull()
    expect(view.queryByTestId('cargo-import-dialog')).toBeNull()
  })

  it('does not open cargo import while creating or loading a sample', async () => {
    const view = render(<TemplateManagerPage {...props()} />)
    fireEvent.click(view.getByTestId('template-manager-new'))
    expect(view.queryByTestId('mapping-modal')).toBeNull()
    expect(view.queryByTestId('confirm-mapping')).toBeNull()
    expect(view.queryByTestId('template-selection-panel')).toBeNull()
    fireEvent.change(view.getByTestId('template-manager-sample-input'), {
      target: { files: [fileWithArrayBuffer('sample.xlsx', async () => workbookBuffer(['Goods', 'L', 'W', 'H']))] },
    })
    await waitFor(() => expect(view.getByTestId('template-manager-sample-status')).toBeTruthy())
    expect(view.queryByTestId('mapping-modal')).toBeNull()
    expect(view.queryByTestId('confirm-mapping')).toBeNull()
  })

})
