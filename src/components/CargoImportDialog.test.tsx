import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CargoImportDialog } from './CargoImportDialog'
import type { ImportCargoRow } from '../lib/importCargo'
import type { ImportTemplate } from '../types'
import { ImportTemplateRequestError } from '../api/importTemplates'

import { workbenchCopy } from '../data/workbenchCopy'

afterEach(cleanup)

function makeTemplate(overrides: Partial<ImportTemplate> = {}): ImportTemplate {
  return {
    id: 't1',
    name: 'Vietnam layout',
    mapping: { label: 'Label', name: 'Name', length: 'L', width: 'W', height: 'H', quantity: 'Qty' },
    units: { length: 'mm', width: 'mm', height: 'mm' },
    headerRow: 1,
    startRow: 2,
    mergeRows: 'none',
    dimensionMode: 'separate',
    combinedColumn: '',
    dimensionOrder: ['length', 'width', 'height'],
    defaultValues: { quantity: 1, canRotate: true, stackable: true },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const importRows: ImportCargoRow[] = [
  { Label: 'Label', Name: 'Name', L: 'L', W: 'W', H: 'H', Qty: 'Qty' },
  { Label: 'A', Name: 'Carton', L: 1000, W: 800, H: 600, Qty: 4 },
]

const MAPPING_FIELDS = [
  'label', 'name', 'length', 'width', 'height', 'weight', 'quantity',
  'color', 'canRotate', 'stackable', 'maxStackLayers', 'groundOnly',
] as const

const labels = new Proxy({}, {
  get: (_target, key: string) => key,
}) as never

function renderDialog(props: Partial<Parameters<typeof CargoImportDialog>[0]> = {}) {
  const onCreateTemplate = props.onCreateTemplate ?? vi.fn().mockResolvedValue(makeTemplate())
  const onUpdateTemplate = props.onUpdateTemplate ?? vi.fn().mockResolvedValue(makeTemplate())
  const utils = render(
    <CargoImportDialog
      importRows={props.importRows ?? importRows}
      importTemplates={props.importTemplates ?? [makeTemplate()]}
      importTemplateLoadFailed={props.importTemplateLoadFailed ?? false}
      locale="en"
      labels={labels}
      userId="u1"
      colors={['#0ea5e9']}
      onConfirm={props.onConfirm ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
      onRefreshTemplates={props.onRefreshTemplates ?? vi.fn()}
      onCreateTemplate={onCreateTemplate}
      onUpdateTemplate={onUpdateTemplate}
    />,
  )
  return { ...utils, onCreateTemplate, onUpdateTemplate }
}

function dialogProps(overrides: Partial<Parameters<typeof CargoImportDialog>[0]> = {}) {
  return {
    importRows,
    importTemplates: [makeTemplate()],
    importTemplateLoadFailed: false,
    locale: 'en' as const,
    labels,
    userId: 'u1',
    colors: ['#0ea5e9'] as const,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    onRefreshTemplates: vi.fn(),
    onCreateTemplate: vi.fn(),
    onUpdateTemplate: vi.fn(),
    ...overrides,
  }
}

function selectTemplate(id: string) {
  fireEvent.click(document.querySelector(`[data-testid="template-selection-item-${id}"]`)!)
}

function chooseWithoutTemplate(view: { getByTestId: (id: string) => HTMLElement }) {
  fireEvent.click(view.getByTestId('use-without-template'))
}

function mapFields(view: { getByTestId: (id: string) => HTMLElement }, mapping: Record<string, string>) {
  for (const [field, column] of Object.entries(mapping)) {
    fireEvent.change(view.getByTestId(`map-select-${field}`), { target: { value: column } })
  }
}

function mappingSelect(view: { getByTestId: (id: string) => HTMLElement }, field: string) {
  return view.getByTestId(`map-select-${field}`) as HTMLSelectElement | HTMLInputElement
}

function expectBlankMapping(view: { getByTestId: (id: string) => HTMLElement }) {
  for (const field of MAPPING_FIELDS) {
    expect(mappingSelect(view, field).value).toBe('')
  }
}

function mapRequiredSeparate(view: { getByTestId: (id: string) => HTMLElement }) {
  mapFields(view, { length: 'L', width: 'W', height: 'H', quantity: 'Qty' })
}

function combinedTemplate(overrides: Partial<ImportTemplate> = {}) {
  return makeTemplate({
    dimensionMode: 'combined',
    combinedColumn: 'L',
    mapping: { label: 'Label', name: 'Name', quantity: 'Qty' },
    dimensionOrder: ['length', 'width', 'height'],
    ...overrides,
  })
}

function echoSavedTemplate(payload: {
  name: string
  mapping: ImportTemplate['mapping']
  units: ImportTemplate['units']
  headerRow?: number
  startRow?: number
  dimensionMode?: ImportTemplate['dimensionMode']
  combinedColumn?: string
  dimensionOrder?: ImportTemplate['dimensionOrder']
  defaultValues?: ImportTemplate['defaultValues']
}, id = 't-new'): ImportTemplate {
  return makeTemplate({
    id,
    name: payload.name,
    mapping: payload.mapping,
    units: payload.units,
    headerRow: payload.headerRow,
    startRow: payload.startRow,
    dimensionMode: payload.dimensionMode,
    combinedColumn: payload.combinedColumn,
    dimensionOrder: payload.dimensionOrder,
    defaultValues: payload.defaultValues,
  })
}

describe('CargoImportDialog two-phase flow', () => {
  it('shows only template selection on first render, not the mapping form', () => {
    const view = renderDialog()

    expect(view.getByTestId('template-selection-panel')).toBeTruthy()
    expect(view.getByTestId('use-without-template')).toBeTruthy()
    expect(view.queryByTestId('mapping-fields')).toBeNull()
    expect(view.queryByTestId('mapping-preview')).toBeNull()
    expect(view.queryByTestId('confirm-mapping')).toBeNull()
  })

  it('starts every mapping field blank after choosing no template', () => {
    const view = renderDialog()

    chooseWithoutTemplate(view)

    expect(view.queryByTestId('template-selection-panel')).toBeNull()
    expect(view.getByTestId('mapping-fields')).toBeTruthy()
    expect(view.getByTestId('mapping-required-length')).toBeTruthy()
    expect(view.getByTestId('mapping-preview')).toBeTruthy()
    expectBlankMapping(view)
    expect((view.getByTestId('template-dimension-mode') as HTMLSelectElement).value).toBe('separate')
    expect((view.getByTestId('template-header-row') as HTMLInputElement).value).toBe('1')
    expect((view.getByTestId('template-start-row') as HTMLInputElement).value).toBe('2')
  })

  it('applies the full template configuration after selecting an existing template', () => {
    const template = makeTemplate({
      mapping: {
        label: 'Label',
        name: 'Name',
        length: 'L',
        width: 'W',
        height: 'H',
        quantity: 'Qty',
        color: '',
      },
      units: { length: 'cm', width: 'mm', height: 'auto' },
      headerRow: 1,
      startRow: 2,
      dimensionMode: 'separate',
      defaultValues: { quantity: 3, canRotate: false, stackable: true, label: 'SKU' },
    })
    const view = renderDialog({ importTemplates: [template] })

    selectTemplate(template.id)

    expect(view.queryByTestId('template-selection-panel')).toBeNull()
    expect(mappingSelect(view, 'label').value).toBe('Label')
    expect(mappingSelect(view, 'name').value).toBe('Name')
    expect(mappingSelect(view, 'length').value).toBe('L')
    expect(mappingSelect(view, 'width').value).toBe('W')
    expect(mappingSelect(view, 'height').value).toBe('H')
    expect(mappingSelect(view, 'quantity').value).toBe('Qty')
    expect(mappingSelect(view, 'weight').value).toBe('')
    expect((view.getByTestId('map-unit-length') as HTMLSelectElement).value).toBe('cm')
    expect((view.getByTestId('map-unit-width') as HTMLSelectElement).value).toBe('mm')
    expect((view.getByTestId('map-unit-height') as HTMLSelectElement).value).toBe('auto')
    expect((view.getByTestId('template-header-row') as HTMLInputElement).value).toBe('1')
    expect((view.getByTestId('template-start-row') as HTMLInputElement).value).toBe('2')
    expect((view.getByTestId('template-dimension-mode') as HTMLSelectElement).value).toBe('separate')
    expect((view.getByTestId('template-default-quantity') as HTMLInputElement).value).toBe('3')
    expect((view.getByTestId('template-default-label') as HTMLInputElement).value).toBe('SKU')
    expect((view.getByTestId('template-default-rotate') as HTMLInputElement).checked).toBe(false)
  })

  it('stays on mapping-preview with mapping and preview both visible after a valid mapping', () => {
    const view = renderDialog({
      importRows: [{ Label: 'A', Name: 'Carton', L: 1000, W: 800, H: 600, Qty: 4 }],
    })

    selectTemplate('t1')

    expect(view.getByTestId('mapping-fields')).toBeTruthy()
    expect(view.getByTestId('mapping-preview')).toBeTruthy()
    expect(view.queryByTestId('template-selection-panel')).toBeNull()
    expect((view.getByTestId('confirm-mapping') as HTMLButtonElement).disabled).toBe(false)
  })

  it('returns to template selection and replaces an unsaved mapping draft on reselect', () => {
    const view = renderDialog()

    chooseWithoutTemplate(view)
    mapFields(view, { length: 'L', name: 'Name' })
    expect(mappingSelect(view, 'length').value).toBe('L')
    expect(mappingSelect(view, 'name').value).toBe('Name')

    fireEvent.click(view.getByTestId('template-selection-back'))
    expect(view.getByTestId('template-selection-panel')).toBeTruthy()
    expect(view.queryByTestId('mapping-fields')).toBeNull()

    selectTemplate('t1')
    expect(mappingSelect(view, 'label').value).toBe('Label')
    expect(mappingSelect(view, 'name').value).toBe('Name')
    expect(mappingSelect(view, 'length').value).toBe('L')
    expect(mappingSelect(view, 'width').value).toBe('W')
    expect(mappingSelect(view, 'height').value).toBe('H')

    fireEvent.click(view.getByTestId('template-selection-back'))
    chooseWithoutTemplate(view)
    expectBlankMapping(view)
  })

  it('keeps use-without available when the catalog fails to load so manual import is not blocked', () => {
    const onRefreshTemplates = vi.fn()
    const onConfirm = vi.fn()
    const view = renderDialog({
      importRows: [{ Label: 'A', Name: 'Carton', L: 1000, W: 800, H: 600, Qty: 4 }],
      importTemplates: [],
      importTemplateLoadFailed: true,
      onRefreshTemplates,
      onConfirm,
    })

    expect(view.getByTestId('template-selection-panel')).toBeTruthy()
    expect(view.getByText('importTemplateLoadFailed')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'importTemplateRetry' }))
    expect(onRefreshTemplates).toHaveBeenCalledOnce()

    chooseWithoutTemplate(view)
    mapFields(view, {
      label: 'Label', name: 'Name', length: 'L', width: 'W', height: 'H', quantity: 'Qty',
    })
    fireEvent.click(view.getByTestId('confirm-mapping'))
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Carton' }),
    ], expect.any(Array))
  })

  it('does not call onConfirm on Escape or cancel', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const view = renderDialog({ onConfirm, onClose })

    fireEvent.keyDown(view.getByTestId('mapping-modal'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
    view.unmount()

    onClose.mockClear()
    const open = renderDialog({ onConfirm, onClose })
    fireEvent.click(open.getByRole('button', { name: 'mappingCancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('resets the session when importRows change', () => {
    const { rerender, getByTestId, queryByTestId } = renderDialog()
    chooseWithoutTemplate({ getByTestId })
    mapFields({ getByTestId }, { length: 'L' })
    expect(mappingSelect({ getByTestId }, 'length').value).toBe('L')

    const nextRows: ImportCargoRow[] = [
      { Sku: 'Sku', Length: 'Length', Width: 'Width', Height: 'Height' },
      { Sku: 'B', Length: 200, Width: 100, Height: 50 },
    ]
    rerender(<CargoImportDialog {...dialogProps({ importRows: nextRows })} />)

    expect(getByTestId('template-selection-panel')).toBeTruthy()
    expect(queryByTestId('mapping-fields')).toBeNull()
    expect(queryByTestId('import-template-name')).toBeNull()

    chooseWithoutTemplate({ getByTestId })
    expectBlankMapping({ getByTestId })
  })
})

describe('CargoImportDialog template reconciliation', () => {
  it('syncs the canonical name when the selected template is renamed elsewhere', async () => {
    const { rerender, getByTestId } = renderDialog({ importTemplates: [makeTemplate()] })

    selectTemplate('t1')
    await waitFor(() => expect(getByTestId('selected-import-template-name').textContent).toBe('Vietnam layout'))

    rerender(
      <CargoImportDialog
        {...dialogProps({ importTemplates: [makeTemplate({ name: 'Vietnam v2' })] })}
      />,
    )

    await waitFor(() => expect(getByTestId('selected-import-template-name').textContent).toBe('Vietnam v2'))
  })

  it('updates instead of creating a duplicate after an authoritative rename', async () => {
    const onCreateTemplate = vi.fn().mockResolvedValue(makeTemplate())
    const onUpdateTemplate = vi.fn().mockResolvedValue(makeTemplate({ name: 'Vietnam v2' }))

    const { rerender, getByTestId } = renderDialog({
      importTemplates: [makeTemplate()],
      onCreateTemplate,
      onUpdateTemplate,
    })

    selectTemplate('t1')
    await waitFor(() => expect(getByTestId('selected-import-template-name').textContent).toBe('Vietnam layout'))

    rerender(
      <CargoImportDialog
        {...dialogProps({
          importTemplates: [makeTemplate({ name: 'Vietnam v2' })],
          onCreateTemplate,
          onUpdateTemplate,
        })}
      />,
    )
    await waitFor(() => expect(getByTestId('selected-import-template-name').textContent).toBe('Vietnam v2'))

    fireEvent.change(getByTestId('map-unit-length'), { target: { value: 'cm' } })
    fireEvent.click(getByTestId('update-import-template'))

    await waitFor(() => expect(onUpdateTemplate).toHaveBeenCalledTimes(1))
    expect(onUpdateTemplate).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Vietnam v2' }))
    expect(onCreateTemplate).not.toHaveBeenCalled()
  })

  it('keeps a save-as name the user edited instead of overwriting it with the canonical name', async () => {
    const { rerender, getByTestId } = renderDialog({ importTemplates: [makeTemplate()] })

    selectTemplate('t1')
    fireEvent.change(getByTestId('map-unit-length'), { target: { value: 'cm' } })
    fireEvent.change(getByTestId('import-template-save-as-name'), { target: { value: 'My copy' } })
    expect((getByTestId('import-template-save-as-name') as HTMLInputElement).value).toBe('My copy')

    rerender(
      <CargoImportDialog
        {...dialogProps({ importTemplates: [makeTemplate()] })}
      />,
    )

    expect((getByTestId('import-template-save-as-name') as HTMLInputElement).value).toBe('My copy')
    expect(getByTestId('selected-import-template-name').textContent).toBe('Vietnam layout')
  })

  it('clears the selection when the selected template is deleted elsewhere', async () => {
    const { rerender, getByTestId, queryByTestId } = renderDialog({ importTemplates: [makeTemplate()] })

    selectTemplate('t1')
    await waitFor(() => expect(getByTestId('selected-import-template-name').textContent).toBe('Vietnam layout'))

    rerender(
      <CargoImportDialog
        {...dialogProps({ importTemplates: [] })}
      />,
    )

    await waitFor(() => expect(queryByTestId('selected-import-template-name')).toBeNull())
  })

  it('keeps the reference intact while the catalog load is failing', async () => {
    const onCreateTemplate = vi.fn().mockResolvedValue(makeTemplate())
    const onUpdateTemplate = vi.fn().mockResolvedValue(makeTemplate())
    const { rerender, getByTestId } = renderDialog({
      importTemplates: [makeTemplate()],
      onCreateTemplate,
      onUpdateTemplate,
    })

    selectTemplate('t1')
    await waitFor(() => expect(getByTestId('selected-import-template-name').textContent).toBe('Vietnam layout'))

    const renderWith = (templates: ImportTemplate[], loadFailed: boolean) => rerender(
      <CargoImportDialog
        {...dialogProps({
          importTemplates: templates,
          importTemplateLoadFailed: loadFailed,
          onCreateTemplate,
          onUpdateTemplate,
        })}
      />,
    )

    renderWith([], true)
    expect(getByTestId('selected-import-template-name').textContent).toBe('Vietnam layout')

    renderWith([makeTemplate()], false)
    await waitFor(() => expect(getByTestId('selected-import-template-name').textContent).toBe('Vietnam layout'))

    fireEvent.change(getByTestId('map-unit-length'), { target: { value: 'cm' } })
    fireEvent.click(getByTestId('update-import-template'))
    await waitFor(() => expect(onUpdateTemplate).toHaveBeenCalledWith('t1', expect.anything()))
    expect(onCreateTemplate).not.toHaveBeenCalled()
  })
})

describe('CargoImportDialog pending import transaction', () => {
  const autoMappedRows: ImportCargoRow[] = [
    { Label: 'A', Name: 'Auto mapped crate', Length: 1000, Width: 800, Height: 600, Weight: 25, Quantity: 2 },
  ]
  const missingWeightRows: ImportCargoRow[] = [
    { Label: 'A', Name: 'Missing weight', Length: 1000, Width: 800, Height: 600, Quantity: 4 },
  ]
  const templateRows: ImportCargoRow[] = [
    { Label: 'A', Name: 'Template weight', L: 1000, W: 800, H: 600, Qty: 4 },
  ]

  it('keeps a mapped workbook pending until explicit confirmation', () => {
    const onConfirm = vi.fn()
    const view = renderDialog({ importRows: autoMappedRows, onConfirm })
    chooseWithoutTemplate(view)
    mapFields(view, {
      label: 'Label', name: 'Name', length: 'Length', width: 'Width',
      height: 'Height', weight: 'Weight', quantity: 'Quantity',
    })

    expect(view.getByTestId('mapping-modal')).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(view.getByTestId('confirm-mapping'))

    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Auto mapped crate', weight: 25, quantity: 2 }),
    ], expect.any(Array))
  })

  it('maps worker matrix rows through the same confirmation path', () => {
    const onConfirm = vi.fn()
    const matrixRows: ImportCargoRow[] = [
      ['Label', 'Name', 'Length', 'Width', 'Height', 'Weight', 'Quantity'],
      ['A', 'Matrix crate', 1000, 800, 600, 25, 2],
    ]
    const view = renderDialog({ importRows: matrixRows, onConfirm })
    chooseWithoutTemplate(view)
    mapFields(view, {
      label: 'Label', name: 'Name', length: 'Length', width: 'Width',
      height: 'Height', weight: 'Weight', quantity: 'Quantity',
    })

    fireEvent.click(view.getByTestId('confirm-mapping'))

    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Matrix crate', weight: 25, quantity: 2 }),
    ], expect.any(Array))
  })

  it('cancels a pending import without confirming cargo', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    const view = renderDialog({ importRows: autoMappedRows, onConfirm, onClose })

    fireEvent.click(view.getByRole('button', { name: 'mappingCancel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('allows untemplated rows with missing or blank weight as internal 1kg', () => {
    const onConfirm = vi.fn()
    const missingWeight = renderDialog({ importRows: missingWeightRows, onConfirm })
    chooseWithoutTemplate(missingWeight)
    mapFields(missingWeight, {
      label: 'Label', name: 'Name', length: 'Length', width: 'Width',
      height: 'Height', quantity: 'Quantity',
    })
    expect((missingWeight.getByTestId('confirm-mapping') as HTMLButtonElement).disabled).toBe(false)
    expect(missingWeight.queryByTestId('weight-default-source')).toBeNull()
    fireEvent.click(missingWeight.getByTestId('confirm-mapping'))
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Missing weight', weight: 1 }),
    ], expect.any(Array))
    missingWeight.unmount()

    onConfirm.mockClear()
    const blankWeightRows: ImportCargoRow[] = [
      { Label: 'A', Name: 'Blank weight', Length: 1000, Width: 800, Height: 600, Weight: '', Quantity: 1 },
    ]
    const blankWeight = renderDialog({ importRows: blankWeightRows, onConfirm })
    chooseWithoutTemplate(blankWeight)
    mapFields(blankWeight, {
      label: 'Label', name: 'Name', length: 'Length', width: 'Width',
      height: 'Height', weight: 'Weight', quantity: 'Quantity',
    })
    expect((blankWeight.getByTestId('confirm-mapping') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(blankWeight.getByTestId('confirm-mapping'))
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Blank weight', weight: 1 }),
    ], expect.any(Array))
  })

  it('does not auto-map weight after the header row is moved past the title', () => {
    const vietnamRows: ImportCargoRow[] = [
      ['越南第十一批6.2海运', null, null, null, null, null, null, null, null],
      ['物料代码SKU', '物料名称', '预计发货数量', '箱数', '产品净重（KG)/个', '产品毛重(KG)/箱', '产品总毛重(KG)', '外箱尺寸（mm）', '箱规'],
      ['TB-C10-EV_v1.1', 'EV cable', 7056, 126, 0.1, 8.27, 1042, '530*305*310', '1'],
      ['TB-C10-EV_v1.2', 'EV cable 2', 1000, 20, 0.1, 8.25, 165, '530*305*310', '1'],
    ]
    const view = renderDialog({ importRows: vietnamRows, importTemplates: [] })
    chooseWithoutTemplate(view)

    expect((view.getByTestId('map-select-weight') as HTMLInputElement).value).toBe('')

    fireEvent.change(view.getByTestId('template-header-row'), { target: { value: '2' } })
    fireEvent.change(view.getByTestId('template-start-row'), { target: { value: '3' } })
    fireEvent.change(view.getByTestId('template-dimension-mode'), { target: { value: 'combined' } })
    fireEvent.change(view.getByTestId('template-combined-column'), { target: { value: '外箱尺寸（mm）' } })

    expect((view.getByTestId('map-select-weight') as HTMLInputElement).value).toBe('')
  })

  it('uses an internal 1kg weight for a selected template that omits a weight mapping', () => {
    const onConfirm = vi.fn()
    const template = makeTemplate()
    const view = renderDialog({ importRows: templateRows, importTemplates: [template], onConfirm })

    selectTemplate(template.id)

    expect((view.getByTestId('confirm-mapping') as HTMLButtonElement).disabled).toBe(false)
    expect(view.queryByTestId('weight-default-source')).toBeNull()
    fireEvent.click(view.getByTestId('confirm-mapping'))
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ weight: 1 }),
    ], expect.any(Array))
  })

  it('does not persist defaultValues.weight when creating a template from the dialog', async () => {
    const onCreateTemplate = vi.fn().mockResolvedValue(makeTemplate())
    const view = renderDialog({ importRows: templateRows, onCreateTemplate })
    chooseWithoutTemplate(view)
    mapRequiredSeparate(view)

    fireEvent.change(view.getByTestId('import-template-name'), { target: { value: 'Template without weight default' } })
    expect(view.queryByTestId('template-default-weight')).toBeNull()
    fireEvent.click(view.getByTestId('save-import-template'))

    await waitFor(() => expect(onCreateTemplate).toHaveBeenCalled())
    const payload = onCreateTemplate.mock.calls[0][0]
    expect(payload.defaultValues).not.toHaveProperty('weight')
  })

  it('uses an internal 1kg weight for a blank mapped cell', () => {
    const onConfirm = vi.fn()
    const blankWeightRows: ImportCargoRow[] = [
      { Label: 'A', Name: 'Blank weight', L: 1000, W: 800, H: 600, Weight: '', Qty: 1 },
    ]
    const template = makeTemplate({
      mapping: { ...makeTemplate().mapping, weight: 'Weight' },
    })
    const view = renderDialog({ importRows: blankWeightRows, importTemplates: [template], onConfirm })

    selectTemplate(template.id)

    expect((view.getByTestId('confirm-mapping') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(view.getByTestId('confirm-mapping'))
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ weight: 1 }),
    ], expect.any(Array))
  })
})

describe('CargoImportDialog template write actions', () => {
  it('hides update and save-as when an existing template mapping is unchanged', () => {
    const view = renderDialog()
    selectTemplate('t1')

    expect(view.queryByTestId('update-import-template')).toBeNull()
    expect(view.queryByTestId('save-as-import-template')).toBeNull()
    expect(view.queryByTestId('save-import-template')).toBeNull()
  })

  it.each([
    {
      name: 'mapping',
      template: () => makeTemplate(),
      dirty: (view: { getByTestId: (id: string) => HTMLElement }) => {
        fireEvent.change(view.getByTestId('map-select-name'), { target: { value: '' } })
      },
    },
    {
      name: 'unit',
      template: () => makeTemplate(),
      dirty: (view: { getByTestId: (id: string) => HTMLElement }) => {
        fireEvent.change(view.getByTestId('map-unit-length'), { target: { value: 'cm' } })
      },
    },
    {
      name: 'header row',
      template: () => makeTemplate(),
      dirty: (view: { getByTestId: (id: string) => HTMLElement }) => {
        fireEvent.change(view.getByTestId('template-header-row'), { target: { value: '2' } })
      },
    },
    {
      name: 'start row',
      template: () => makeTemplate(),
      dirty: (view: { getByTestId: (id: string) => HTMLElement }) => {
        fireEvent.change(view.getByTestId('template-start-row'), { target: { value: '3' } })
      },
    },
    {
      name: 'dimension mode',
      template: () => makeTemplate(),
      dirty: (view: { getByTestId: (id: string) => HTMLElement }) => {
        fireEvent.change(view.getByTestId('template-dimension-mode'), { target: { value: 'combined' } })
      },
    },
    {
      name: 'combined column',
      template: () => combinedTemplate(),
      dirty: (view: { getByTestId: (id: string) => HTMLElement }) => {
        fireEvent.change(view.getByTestId('template-combined-column'), { target: { value: 'W' } })
      },
    },
    {
      name: 'dimension order',
      template: () => combinedTemplate(),
      dirty: (view: { getByTestId: (id: string) => HTMLElement }) => {
        fireEvent.change(view.getByTestId('template-dimension-order'), { target: { value: 'width,height,length' } })
      },
    },
    {
      name: 'visible default',
      template: () => makeTemplate(),
      dirty: (view: { getByTestId: (id: string) => HTMLElement }) => {
        fireEvent.change(view.getByTestId('template-default-quantity'), { target: { value: '9' } })
      },
    },
  ])('shows update and save-as after a $name change', ({ template, dirty }) => {
    const selected = template()
    const view = renderDialog({ importTemplates: [selected] })
    selectTemplate(selected.id)

    expect(view.queryByTestId('update-import-template')).toBeNull()
    expect(view.queryByTestId('save-as-import-template')).toBeNull()

    dirty(view)

    expect(view.getByTestId('update-import-template')).toBeTruthy()
    expect(view.getByTestId('save-as-import-template')).toBeTruthy()
  })

  it('shows save-template for a valid untemplated mapping and not update or save-as', () => {
    const view = renderDialog({ importTemplates: [] })
    chooseWithoutTemplate(view)
    mapRequiredSeparate(view)

    expect(view.getByTestId('save-import-template')).toBeTruthy()
    expect(view.getByTestId('import-template-name').closest('label')?.querySelector('[aria-hidden="true"]')?.textContent).toBe('*')
    expect(view.queryByTestId('update-import-template')).toBeNull()
    expect(view.queryByTestId('save-as-import-template')).toBeNull()
  })

  it('update calls only onUpdateTemplate with the original template name', async () => {
    const onCreateTemplate = vi.fn()
    const onUpdateTemplate = vi.fn().mockResolvedValue(makeTemplate())
    const view = renderDialog({ onCreateTemplate, onUpdateTemplate })
    selectTemplate('t1')
    fireEvent.change(view.getByTestId('map-unit-length'), { target: { value: 'cm' } })
    fireEvent.change(view.getByTestId('import-template-save-as-name'), { target: { value: 'A copy' } })
    fireEvent.click(view.getByTestId('update-import-template'))

    await waitFor(() => expect(onUpdateTemplate).toHaveBeenCalledTimes(1))
    expect(onUpdateTemplate).toHaveBeenCalledWith('t1', expect.objectContaining({
      name: 'Vietnam layout',
      units: expect.objectContaining({ length: 'cm' }),
    }))
    expect(onCreateTemplate).not.toHaveBeenCalled()
  })

  it('marks save-as name as required and blocks empty, original, and duplicate names before requesting', () => {
    const other = makeTemplate({ id: 't2', name: 'Other layout' })
    const onCreateTemplate = vi.fn()
    const view = renderDialog({ importTemplates: [makeTemplate(), other], onCreateTemplate })
    selectTemplate('t1')
    fireEvent.change(view.getByTestId('map-unit-length'), { target: { value: 'cm' } })

    const saveAsInput = view.getByTestId('import-template-save-as-name')
    expect(saveAsInput.closest('label')?.querySelector('[aria-hidden="true"]')?.textContent).toBe('*')
    expect(saveAsInput.closest('label')?.textContent).toContain('templateSaveAsName')

    fireEvent.click(view.getByTestId('save-as-import-template'))
    expect(view.getByTestId('template-write-error').textContent).toBe('templateNameRequired')
    expect(onCreateTemplate).not.toHaveBeenCalled()

    fireEvent.change(saveAsInput, { target: { value: '  Vietnam layout  ' } })
    fireEvent.click(view.getByTestId('save-as-import-template'))
    expect(view.getByTestId('template-write-error').textContent).toBe('templateNameUnchanged')
    expect(onCreateTemplate).not.toHaveBeenCalled()

    fireEvent.change(saveAsInput, { target: { value: 'Other layout' } })
    fireEvent.click(view.getByTestId('save-as-import-template'))
    expect(view.getByTestId('template-write-error').textContent).toBe('templateNameDuplicate')
    expect(onCreateTemplate).not.toHaveBeenCalled()
  })

  it('save-as calls only onCreateTemplate', async () => {
    const onCreateTemplate = vi.fn().mockImplementation(async (payload) => echoSavedTemplate(payload, 't-copy'))
    const onUpdateTemplate = vi.fn()
    const view = renderDialog({ onCreateTemplate, onUpdateTemplate })
    selectTemplate('t1')
    fireEvent.change(view.getByTestId('map-unit-length'), { target: { value: 'cm' } })
    fireEvent.change(view.getByTestId('import-template-save-as-name'), { target: { value: 'Vietnam copy' } })
    fireEvent.click(view.getByTestId('save-as-import-template'))

    await waitFor(() => expect(onCreateTemplate).toHaveBeenCalledTimes(1))
    expect(onCreateTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Vietnam copy' }))
    expect(onUpdateTemplate).not.toHaveBeenCalled()
  })

  it('shows localized errors for 400, 409, and network failures without clearing the draft', async () => {
    const onCreateTemplate = vi.fn()
      .mockRejectedValueOnce(new ImportTemplateRequestError('Invalid template', 400, 'invalid-template'))
      .mockRejectedValueOnce(new ImportTemplateRequestError('Template name already exists', 409, 'duplicate-name'))
      .mockRejectedValueOnce(new ImportTemplateRequestError('保存模板失败', 500, 'request-failed'))
    const view = renderDialog({ importTemplates: [], onCreateTemplate })
    chooseWithoutTemplate(view)
    mapRequiredSeparate(view)
    fireEvent.change(view.getByTestId('import-template-name'), { target: { value: 'Solo' } })

    fireEvent.click(view.getByTestId('save-import-template'))
    await waitFor(() => expect(view.getByTestId('template-write-error').textContent).toBe('templateConfigInvalid'))
    expect((view.getByTestId('import-template-name') as HTMLInputElement).value).toBe('Solo')
    expect(mappingSelect(view, 'length').value).toBe('L')
    expect(view.getByTestId('mapping-modal')).toBeTruthy()

    fireEvent.click(view.getByTestId('save-import-template'))
    await waitFor(() => expect(view.getByTestId('template-write-error').textContent).toBe('templateNameDuplicate'))

    fireEvent.click(view.getByTestId('save-import-template'))
    await waitFor(() => expect(view.getByTestId('template-write-error').textContent).toBe('templateSaveFailed'))
    expect(view.queryByTestId('template-selection-panel')).toBeNull()
    expect(mappingSelect(view, 'width').value).toBe('W')
  })

  it('disables every write action while a write is pending and ignores duplicate clicks', async () => {
    let resolveCreate!: (value: ImportTemplate) => void
    const onCreateTemplate = vi.fn().mockImplementation(() => new Promise<ImportTemplate>((resolve) => {
      resolveCreate = resolve
    }))
    const createView = renderDialog({ importTemplates: [], onCreateTemplate })
    chooseWithoutTemplate(createView)
    mapRequiredSeparate(createView)
    fireEvent.change(createView.getByTestId('import-template-name'), { target: { value: 'Solo' } })
    const createBtn = createView.getByTestId('save-import-template') as HTMLButtonElement
    fireEvent.click(createBtn)
    fireEvent.click(createBtn)
    await waitFor(() => expect(onCreateTemplate).toHaveBeenCalledTimes(1))
    expect(createBtn.disabled).toBe(true)
    resolveCreate(echoSavedTemplate(onCreateTemplate.mock.calls[0][0]))
    createView.unmount()

    let resolveUpdate!: (value: ImportTemplate) => void
    const onUpdateTemplate = vi.fn().mockImplementation(() => new Promise<ImportTemplate>((resolve) => {
      resolveUpdate = resolve
    }))
    const onCreate = vi.fn()
    const view = renderDialog({ onUpdateTemplate, onCreateTemplate: onCreate })
    selectTemplate('t1')
    fireEvent.change(view.getByTestId('map-unit-length'), { target: { value: 'cm' } })
    const updateBtn = view.getByTestId('update-import-template') as HTMLButtonElement
    const saveAsBtn = view.getByTestId('save-as-import-template') as HTMLButtonElement
    fireEvent.click(updateBtn)
    fireEvent.click(updateBtn)
    fireEvent.click(saveAsBtn)
    await waitFor(() => expect(onUpdateTemplate).toHaveBeenCalledTimes(1))
    expect(onCreate).not.toHaveBeenCalled()
    expect(updateBtn.disabled).toBe(true)
    expect(saveAsBtn.disabled).toBe(true)
    expect(view.queryByTestId('save-import-template')).toBeNull()
    resolveUpdate(makeTemplate())
  })

  it('keeps the dialog open after a successful save without calling onConfirm and resets the comparison baseline', async () => {
    const onCreateTemplate = vi.fn().mockImplementation(async (payload) => echoSavedTemplate(payload, 't-new'))
    const onConfirm = vi.fn()
    const view = renderDialog({ importTemplates: [], onCreateTemplate, onConfirm })
    chooseWithoutTemplate(view)
    mapRequiredSeparate(view)
    fireEvent.change(view.getByTestId('import-template-name'), { target: { value: 'Manual save' } })
    fireEvent.click(view.getByTestId('save-import-template'))

    await waitFor(() => expect(onCreateTemplate).toHaveBeenCalledTimes(1))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(view.getByTestId('mapping-modal')).toBeTruthy()
    expect(view.getByTestId('mapping-fields')).toBeTruthy()
    expect(view.getByTestId('selected-import-template-name').textContent).toBe('Manual save')
    expect(view.queryByTestId('save-import-template')).toBeNull()
    expect(view.queryByTestId('update-import-template')).toBeNull()
    expect(view.queryByTestId('save-as-import-template')).toBeNull()

    fireEvent.change(view.getByTestId('map-unit-length'), { target: { value: 'cm' } })
    expect(view.getByTestId('update-import-template')).toBeTruthy()
    expect(view.getByTestId('save-as-import-template')).toBeTruthy()
  })

  it('resets comparison baseline and pending write when importRows change', async () => {
    const onCreateTemplate = vi.fn().mockImplementation(() => new Promise<ImportTemplate>(() => undefined))
    const { rerender, getByTestId, queryByTestId } = renderDialog({ onCreateTemplate })
    chooseWithoutTemplate({ getByTestId })
    mapRequiredSeparate({ getByTestId })
    fireEvent.change(getByTestId('import-template-name'), { target: { value: 'Pending' } })
    fireEvent.click(getByTestId('save-import-template'))
    await waitFor(() => expect(onCreateTemplate).toHaveBeenCalledTimes(1))
    expect((getByTestId('save-import-template') as HTMLButtonElement).disabled).toBe(true)

    const nextRows: ImportCargoRow[] = [
      { Sku: 'Sku', Length: 'Length', Width: 'Width', Height: 'Height' },
      { Sku: 'B', Length: 200, Width: 100, Height: 50 },
    ]
    rerender(<CargoImportDialog {...dialogProps({ importRows: nextRows, onCreateTemplate })} />)

    expect(getByTestId('template-selection-panel')).toBeTruthy()
    expect(queryByTestId('save-import-template')).toBeNull()

    chooseWithoutTemplate({ getByTestId })
    mapFields({ getByTestId }, { length: 'Length', width: 'Width', height: 'Height' })
    fireEvent.change(getByTestId('import-template-name'), { target: { value: 'After reset' } })
    fireEvent.click(getByTestId('save-import-template'))
    await waitFor(() => expect(onCreateTemplate).toHaveBeenCalledTimes(2))
  })

  it('does not apply a write that completes after back and reselect', async () => {
    let resolveCreate!: (value: ImportTemplate) => void
    const onCreateTemplate = vi.fn().mockImplementation(() => new Promise<ImportTemplate>((resolve) => {
      resolveCreate = resolve
    }))
    const other = makeTemplate({
      id: 't2',
      name: 'Other layout',
      units: { length: 'cm', width: 'cm', height: 'cm' },
    })
    const view = renderDialog({
      importTemplates: [makeTemplate(), other],
      onCreateTemplate,
    })
    chooseWithoutTemplate(view)
    mapRequiredSeparate(view)
    fireEvent.change(view.getByTestId('import-template-name'), { target: { value: 'Solo' } })
    fireEvent.click(view.getByTestId('save-import-template'))
    await waitFor(() => expect(onCreateTemplate).toHaveBeenCalledTimes(1))

    fireEvent.click(view.getByTestId('template-selection-back'))
    selectTemplate('t2')

    expect(view.getByTestId('selected-import-template-name').textContent).toBe('Other layout')
    expect((view.getByTestId('map-unit-length') as HTMLSelectElement).value).toBe('cm')
    expect(view.queryByTestId('update-import-template')).toBeNull()

    await act(async () => {
      resolveCreate(echoSavedTemplate(onCreateTemplate.mock.calls[0][0], 't-stale'))
    })

    expect(view.getByTestId('selected-import-template-name').textContent).toBe('Other layout')
    expect(mappingSelect(view, 'length').value).toBe('L')
    expect(view.queryByTestId('update-import-template')).toBeNull()
    expect(view.queryByTestId('save-import-template')).toBeNull()
    expect(view.queryByTestId('template-save-status')).toBeNull()
  })
})

describe('CargoImportDialog scenario contracts E/I/J/N', () => {
  it('blocks confirm when a mapped weight is non-empty invalid', () => {
    const onConfirm = vi.fn()
    const view = renderDialog({
      importRows: [{ Name: 'Bad weight crate', L: 900, W: 700, H: 500, Weight: -1, Qty: 1 }],
      onConfirm,
    })
    chooseWithoutTemplate(view)
    mapFields(view, { name: 'Name', length: 'L', width: 'W', height: 'H', weight: 'Weight', quantity: 'Qty' })

    expect((view.getByTestId('confirm-mapping') as HTMLButtonElement).disabled).toBe(true)
    expect(view.getByTestId('mapping-error-hint')).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables save when required mappings are missing or duplicated', () => {
    const view = renderDialog({ importTemplates: [] })
    chooseWithoutTemplate(view)
    fireEvent.change(view.getByTestId('import-template-name'), { target: { value: 'Incomplete' } })
    expect((view.getByTestId('save-import-template') as HTMLButtonElement).disabled).toBe(true)

    mapFields(view, { length: 'L', width: 'L', height: 'H' })
    expect((view.getByTestId('save-import-template') as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps a selected template and blocks confirm when mapped columns are missing', () => {
    const template = makeTemplate()
    const view = renderDialog({
      importRows: [{ Goods: 'Missing length crate', W: 60, H: 40, Qty: 2 }],
      importTemplates: [template],
    })
    selectTemplate(template.id)

    expect(view.getByTestId('selected-import-template-name').textContent).toBe('Vietnam layout')
    expect(view.getByTestId('map-select-length').getAttribute('data-invalid')).toBe('true')
    expect(view.getAllByText(/Column not found in file/).length).toBeGreaterThan(0)
    expect((view.getByTestId('confirm-mapping') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(view.getByTestId('map-unit-width'), { target: { value: 'cm' } })
    expect((view.getByTestId('update-import-template') as HTMLButtonElement).disabled).toBe(true)
    expect((view.getByTestId('save-as-import-template') as HTMLButtonElement).disabled).toBe(true)
  })

  it('exposes Chinese and English template selection and mapping actions', () => {
    const zh = render(
      <CargoImportDialog
        {...dialogProps({ locale: 'zh', labels: workbenchCopy.zh as never, importTemplates: [] })}
      />,
    )
    expect(zh.getByTestId('template-selection-panel').textContent).toContain('选择导入模板')
    expect(zh.getByTestId('use-without-template').textContent).toBe('不使用模板')
    fireEvent.click(zh.getByTestId('use-without-template'))
    expect(zh.getByTestId('mapping-required-length')).toBeTruthy()
    expect(zh.getByText('* 表示完成当前配置所必需的项目')).toBeTruthy()
    expect(zh.getByTestId('save-import-template').textContent).toBe('保存模板')
    expect(zh.getByTestId('confirm-mapping').textContent).toBe('确认导入')
    zh.unmount()

    const en = render(
      <CargoImportDialog
        {...dialogProps({ locale: 'en', labels: workbenchCopy.en as never, importTemplates: [] })}
      />,
    )
    expect(en.getByTestId('template-selection-panel').textContent).toContain('Choose an import template')
    expect(en.getByTestId('use-without-template').textContent).toBe('Continue without a template')
    fireEvent.click(en.getByTestId('use-without-template'))
    expect(en.getByTestId('mapping-required-length')).toBeTruthy()
    expect(en.getByTestId('save-import-template').textContent).toBe('Save template')
    expect(en.getByTestId('confirm-mapping').textContent).toBe('Confirm import')
    en.unmount()
  })
})

describe('CargoImportDialog keyboard focus management', () => {
  it('focuses the dialog, traps Tab in both directions, closes on Escape, and restores prior focus', () => {
    const prior = document.createElement('button')
    document.body.appendChild(prior)
    prior.focus()
    const onClose = vi.fn()
    const view = renderDialog({ onClose })
    const dialog = view.getByTestId('mapping-modal')

    expect(document.activeElement).toBe(dialog)

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    first.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    last.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
    expect(document.activeElement).toBe(prior)
    prior.remove()
  })
})
