import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CargoImportDialog } from './CargoImportDialog'
import type { ImportCargoRow } from '../lib/importCargo'
import type { ImportTemplate } from '../types'

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

// Header row + one data row so the dialog has columns to map.
const importRows: ImportCargoRow[] = [
  { Label: 'Label', Name: 'Name', L: 'L', W: 'W', H: 'H', Qty: 'Qty' },
  { Label: 'A', Name: 'Carton', L: 1000, W: 800, H: 600, Qty: 4 },
]

// The dialog reads ~40 label strings; an identity proxy keeps the fixture small
// while still rendering real text for queries.
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

function selectTemplate(id: string) {
  const select = document.querySelector('[data-testid="import-template-select"]') as HTMLSelectElement
  fireEvent.change(select, { target: { value: id } })
}

function mapFields(view: { getByTestId: (id: string) => HTMLElement }, mapping: Record<string, string>) {
  for (const [field, column] of Object.entries(mapping)) {
    fireEvent.change(view.getByTestId(`map-select-${field}`), { target: { value: column } })
  }
}



function templateNameInput() {
  return document.querySelector('[data-testid="import-template-name"]') as HTMLInputElement
}

describe('CargoImportDialog template reconciliation', () => {
  it('syncs the canonical name when the selected template is renamed elsewhere', async () => {
    const { rerender } = renderDialog({ importTemplates: [makeTemplate()] })

    selectTemplate('t1')
    await waitFor(() => expect(templateNameInput().value).toBe('Vietnam layout'))

    // The shared catalog refresh reports an authoritative rename.
    rerender(
      <CargoImportDialog
        importRows={importRows}
        importTemplates={[makeTemplate({ name: 'Vietnam v2' })]}
        importTemplateLoadFailed={false}
        locale="en"
        labels={labels}
        userId="u1"
        colors={['#0ea5e9']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onRefreshTemplates={vi.fn()}
        onCreateTemplate={vi.fn()}
        onUpdateTemplate={vi.fn()}
      />,
    )

    await waitFor(() => expect(templateNameInput().value).toBe('Vietnam v2'))
  })

  it('updates instead of creating a duplicate after an authoritative rename', async () => {
    const onCreateTemplate = vi.fn().mockResolvedValue(makeTemplate())
    const onUpdateTemplate = vi.fn().mockResolvedValue(makeTemplate({ name: 'Vietnam v2' }))

    const { rerender } = renderDialog({
      importTemplates: [makeTemplate()],
      onCreateTemplate,
      onUpdateTemplate,
    })

    selectTemplate('t1')
    await waitFor(() => expect(templateNameInput().value).toBe('Vietnam layout'))

    rerender(
      <CargoImportDialog
        importRows={importRows}
        importTemplates={[makeTemplate({ name: 'Vietnam v2' })]}
        importTemplateLoadFailed={false}
        locale="en"
        labels={labels}
        userId="u1"
        colors={['#0ea5e9']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onRefreshTemplates={vi.fn()}
        onCreateTemplate={onCreateTemplate}
        onUpdateTemplate={onUpdateTemplate}
      />,
    )
    await waitFor(() => expect(templateNameInput().value).toBe('Vietnam v2'))

    fireEvent.click(document.querySelector('[data-testid="save-import-template"]')!)

    // Saving an unchanged, renamed template must update it — not create a second one.
    await waitFor(() => expect(onUpdateTemplate).toHaveBeenCalledTimes(1))
    expect(onUpdateTemplate).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Vietnam v2' }))
    expect(onCreateTemplate).not.toHaveBeenCalled()
  })

  it('keeps a name the user edited instead of overwriting it with the canonical name', async () => {
    const { rerender } = renderDialog({ importTemplates: [makeTemplate()] })

    selectTemplate('t1')
    await waitFor(() => expect(templateNameInput().value).toBe('Vietnam layout'))

    // User types a "save as" name.
    fireEvent.change(templateNameInput(), { target: { value: 'My copy' } })
    expect(templateNameInput().value).toBe('My copy')

    // A catalog refresh arrives; it must not clobber the user's draft name.
    rerender(
      <CargoImportDialog
        importRows={importRows}
        importTemplates={[makeTemplate()]}
        importTemplateLoadFailed={false}
        locale="en"
        labels={labels}
        userId="u1"
        colors={['#0ea5e9']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onRefreshTemplates={vi.fn()}
        onCreateTemplate={vi.fn()}
        onUpdateTemplate={vi.fn()}
      />,
    )

    expect(templateNameInput().value).toBe('My copy')
  })

  it('clears the selection when the selected template is deleted elsewhere', async () => {
    const { rerender } = renderDialog({ importTemplates: [makeTemplate()] })

    selectTemplate('t1')
    await waitFor(() => expect(templateNameInput().value).toBe('Vietnam layout'))

    // Template deleted in the template manager; catalog refresh returns without it.
    rerender(
      <CargoImportDialog
        importRows={importRows}
        importTemplates={[]}
        importTemplateLoadFailed={false}
        locale="en"
        labels={labels}
        userId="u1"
        colors={['#0ea5e9']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onRefreshTemplates={vi.fn()}
        onCreateTemplate={vi.fn()}
        onUpdateTemplate={vi.fn()}
      />,
    )

    await waitFor(() => {
      const select = document.querySelector('[data-testid="import-template-select"]') as HTMLSelectElement
      expect(select.value).toBe('')
      expect(templateNameInput().value).toBe('')
    })
  })

  it('keeps the reference intact while the catalog load is failing', async () => {
    const onCreateTemplate = vi.fn().mockResolvedValue(makeTemplate())
    const onUpdateTemplate = vi.fn().mockResolvedValue(makeTemplate())
    const { rerender } = renderDialog({
      importTemplates: [makeTemplate()],
      onCreateTemplate,
      onUpdateTemplate,
    })

    selectTemplate('t1')
    await waitFor(() => expect(templateNameInput().value).toBe('Vietnam layout'))

    const renderWith = (templates: ImportTemplate[], loadFailed: boolean) => rerender(
      <CargoImportDialog
        importRows={importRows}
        importTemplates={templates}
        importTemplateLoadFailed={loadFailed}
        locale="en"
        labels={labels}
        userId="u1"
        colors={['#0ea5e9']}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onRefreshTemplates={vi.fn()}
        onCreateTemplate={onCreateTemplate}
        onUpdateTemplate={onUpdateTemplate}
      />,
    )

    // Load failure must not be mistaken for a deletion.
    renderWith([], true)
    expect(templateNameInput().value).toBe('Vietnam layout')

    // The name alone cannot distinguish "reference kept" from "name kept but ID
    // cleared", because the option is absent from an empty list either way. Restore
    // the catalog and assert the ID itself survived.
    renderWith([makeTemplate()], false)
    await waitFor(() => {
      const select = document.querySelector('[data-testid="import-template-select"]') as HTMLSelectElement
      expect(select.value).toBe('t1')
    })

    // Strongest proof the ID is intact: saving still routes to update, not create.
    fireEvent.click(document.querySelector('[data-testid="save-import-template"]')!)
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
