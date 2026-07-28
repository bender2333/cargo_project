import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CargoItem } from '../types'
import {
  CargoLibraryPage,
  type CargoLibraryPageLabels,
  type CargoLibraryPageProps,
} from './CargoLibraryPage'

const labels: CargoLibraryPageLabels = {
  cargoLibrary: 'Cargo library',
  backToWorkbench: 'Back to workbench',
  name: 'Name',
  group: 'Group',
  length: 'Length',
  width: 'Width',
  height: 'Height',
  weight: 'Weight',
  color: 'Color',
  rotate: 'Rotate',
  stackable: 'Stackable',
  groundOnly: 'Ground only',
  maxStackLayers: 'Max stack layers',
  cancel: 'Cancel',
  cargoLibraryEmpty: 'No saved cargo yet',
  cargoLibrarySave: 'Save cargo',
  cargoLibraryUpdate: 'Update cargo',
  cargoLibraryUse: 'Add to workbench',
  cargoLibraryEdit: 'Edit',
  cargoLibraryDelete: 'Delete',
  cargoLibraryNoticeSaved: 'Cargo saved',
  cargoLibraryNoticeUpdated: 'Cargo updated',
  cargoLibraryNoticeDeleted: 'Cargo deleted',
  cargoLibraryLoadFailed: 'Failed to load cargo library',
  cargoLibraryRetry: 'Retry',
}

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'cargo-1',
    name: 'Palletized parts',
    label: 'PX',
    length: 1200,
    width: 800,
    height: 950,
    weight: 320,
    quantity: 9,
    color: '#16a34a',
    canRotate: false,
    stackable: true,
    maxStackLayers: 3,
    groundOnly: true,
    ...overrides,
  }
}

function pageProps(overrides: Partial<CargoLibraryPageProps> = {}): CargoLibraryPageProps {
  return {
    locale: 'en',
    labels,
    items: [],
    loadFailed: false,
    onRetry: vi.fn(),
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onUseCargo: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CargoLibraryPage', () => {
  it('creates one reusable cargo definition with an uppercase label (no truncation) and no stale stack limit', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const view = render(<CargoLibraryPage {...pageProps({ onCreate })} />)

    fireEvent.change(view.getByLabelText('Name'), { target: { value: '  Priority carton  ' } })
    fireEvent.change(view.getByLabelText('Group'), { target: { value: 'abz' } })
    expect((view.getByLabelText('Group') as HTMLInputElement).value).toBe('ABZ')
    fireEvent.change(view.getByLabelText('Max stack layers'), { target: { value: '7' } })
    fireEvent.click(view.getByLabelText('Stackable'))
    expect(view.queryByLabelText('Max stack layers')).toBeNull()

    fireEvent.click(view.getByRole('button', { name: 'Save cargo' }))

    await waitFor(() => expect(view.getByText('Cargo saved')).toBeTruthy())
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith({
      id: expect.any(String),
      name: 'Priority carton',
      label: 'ABZ',
      length: 400,
      width: 500,
      height: 600,
      weight: 24,
      quantity: 1,
      color: '#0ea5e9',
      canRotate: true,
      stackable: false,
      maxStackLayers: undefined,
      groundOnly: false,
    })
  })

  it('generates the next Excel-style label when the group is blank', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const existingItems = Array.from({ length: 26 }, (_, index) =>
      cargo({ id: `cargo-${index}`, name: `Cargo ${index}` }),
    )
    const view = render(
      <CargoLibraryPage {...pageProps({ items: existingItems, onCreate })} />,
    )

    fireEvent.change(view.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.change(view.getByLabelText('Group'), { target: { value: '' } })
    fireEvent.click(view.getByRole('button', { name: 'Save cargo' }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Library cargo',
        label: 'AA',
        quantity: 1,
      }),
    )
  })

  it('updates the selected definition and restores the create defaults after update or cancel', async () => {
    const item = cargo()
    const onUpdate = vi.fn().mockResolvedValue(undefined)
    const view = render(
      <CargoLibraryPage {...pageProps({ items: [item], onUpdate })} />,
    )

    fireEvent.click(view.getByTestId('cargo-library-edit-cargo-1'))
    expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe(item.name)
    expect((view.getByLabelText('Group') as HTMLInputElement).value).toBe('PX')
    expect((view.getByLabelText('Max stack layers') as HTMLInputElement).value).toBe('3')
    expect((view.getByLabelText('Ground only') as HTMLInputElement).checked).toBe(true)

    fireEvent.change(view.getByLabelText('Name'), { target: { value: 'Updated parts' } })
    fireEvent.click(view.getByRole('button', { name: 'Update cargo' }))

    await waitFor(() => expect(view.getByText('Cargo updated')).toBeTruthy())
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenCalledWith(
      'cargo-1',
      expect.objectContaining({
        id: 'cargo-1',
        name: 'Updated parts',
        label: 'PX',
        quantity: 1,
        maxStackLayers: 3,
      }),
    )
    expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Carton B')
    expect(view.getByRole('button', { name: 'Save cargo' })).toBeTruthy()

    fireEvent.click(view.getByTestId('cargo-library-edit-cargo-1'))
    fireEvent.change(view.getByLabelText('Name'), { target: { value: 'Discard this edit' } })
    fireEvent.click(view.getByRole('button', { name: 'Cancel' }))

    expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Carton B')
    expect((view.getByLabelText('Group') as HTMLInputElement).value).toBe('B')
    expect(view.getByRole('button', { name: 'Save cargo' })).toBeTruthy()
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('deletes a definition and exits edit mode only after deletion succeeds', async () => {
    const item = cargo()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const view = render(
      <CargoLibraryPage {...pageProps({ items: [item], onDelete })} />,
    )

    fireEvent.click(view.getByTestId('cargo-library-edit-cargo-1'))
    fireEvent.change(view.getByLabelText('Name'), { target: { value: 'Editing before delete' } })
    fireEvent.click(view.getByTestId('cargo-library-delete-cargo-1'))

    await waitFor(() => expect(view.getByText('Cargo deleted')).toBeTruthy())
    expect(onDelete).toHaveBeenCalledWith('cargo-1')
    expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Carton B')
    expect(view.getByRole('button', { name: 'Save cargo' })).toBeTruthy()
  })

  it('keeps the edit draft visible and alerts when deletion fails', async () => {
    const alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const item = cargo()
    const onDelete = vi.fn().mockRejectedValue(new Error('delete failed'))
    const view = render(
      <CargoLibraryPage {...pageProps({ items: [item], onDelete })} />,
    )

    fireEvent.click(view.getByTestId('cargo-library-edit-cargo-1'))
    fireEvent.change(view.getByLabelText('Name'), { target: { value: 'Unsaved edit' } })
    fireEvent.click(view.getByTestId('cargo-library-delete-cargo-1'))

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Failed to delete cargo'))
    expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Unsaved edit')
    expect(view.getByRole('button', { name: 'Update cargo' })).toBeTruthy()
    expect(view.queryByText('Cargo deleted')).toBeNull()
  })

  it('alerts on save failure without discarding the draft', async () => {
    const alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onCreate = vi.fn().mockRejectedValue(new Error('save failed'))
    const view = render(<CargoLibraryPage {...pageProps({ onCreate })} />)

    fireEvent.change(view.getByLabelText('Name'), { target: { value: 'Keep this draft' } })
    fireEvent.click(view.getByRole('button', { name: 'Save cargo' }))

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Failed to save cargo'))
    expect((view.getByLabelText('Name') as HTMLInputElement).value).toBe('Keep this draft')
    expect(view.queryByText('Cargo saved')).toBeNull()
  })

  it('forwards use and back actions from the page boundary', () => {
    const item = cargo()
    const onUseCargo = vi.fn()
    const onBack = vi.fn()
    const view = render(
      <CargoLibraryPage {...pageProps({ items: [item], onUseCargo, onBack })} />,
    )

    fireEvent.click(view.getByTestId('cargo-library-use-cargo-1'))
    fireEvent.click(view.getByRole('button', { name: 'Back to workbench' }))

    expect(onUseCargo).toHaveBeenCalledWith(item)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows retry for a failed load without presenting failure as an empty library', () => {
    const onRetry = vi.fn()
    const view = render(
      <CargoLibraryPage {...pageProps({ loadFailed: true, onRetry })} />,
    )

    expect(view.getByTestId('cargo-library-load-error')).toBeTruthy()
    expect(view.queryByTestId('cargo-library-empty-state')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
