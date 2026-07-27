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
      importRows={importRows}
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
    const { rerender } = renderDialog({ importTemplates: [makeTemplate()] })

    selectTemplate('t1')
    await waitFor(() => expect(templateNameInput().value).toBe('Vietnam layout'))

    // Load failure must not be mistaken for a deletion.
    rerender(
      <CargoImportDialog
        importRows={importRows}
        importTemplates={[]}
        importTemplateLoadFailed
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

    // The name is the observable proxy for "reference kept": a cleared reference
    // also clears the name. (select.value would be '' either way once the option
    // disappears from an empty list, so it cannot distinguish the two cases.)
    expect(templateNameInput().value).toBe('Vietnam layout')
  })
})
