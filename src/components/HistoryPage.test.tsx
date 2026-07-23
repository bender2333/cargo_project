import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoryPlan } from '../hooks/useHistoryPlans'
import { HistoryPage, type HistoryPageLabels } from './HistoryPage'

const labels: HistoryPageLabels = {
  title: 'History plans',
  noHistory: 'No saved plans',
  savePlan: 'Save plan',
  backToWorkbench: 'Back to workbench',
  shipmentName: 'Shipment',
  layers: 'layers',
  restore: 'Restore',
  delete: 'Delete',
  retry: 'Retry',
  loadFailed: 'Failed to load history plans',
  confirmDelete: 'Confirm delete',
  saveFailed: 'Failed to save plan',
  deleteFailed: 'Failed to delete',
}

const plan: HistoryPlan = {
  id: 'plan-1',
  createdAt: '2026-07-23T00:00:00.000Z',
  projectName: 'Project',
  shipmentName: 'Shipment',
  loadingMode: 'quantity',
  containerId: '20gp',
  container: {
    id: '20gp',
    label: '20GP',
    description: 'Container',
    length: 5898,
    width: 2352,
    height: 2393,
    maxWeight: 28000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
  },
  cargoItems: [],
  placedCount: 1,
  totalCargoCount: 2,
  layerCount: 1,
  labelSummary: 'A:1/2',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HistoryPage', () => {
  it('keeps restore, save, delete, retry, and back actions at the page boundary', async () => {
    const onRestore = vi.fn()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const onRetry = vi.fn().mockResolvedValue(undefined)
    const onBack = vi.fn()
    vi.stubGlobal('confirm', vi.fn(() => true))

    const view = render(
      <HistoryPage
        labels={labels}
        plans={[plan]}
        loadFailed={false}
        onRetry={onRetry}
        onSave={onSave}
        onRestore={onRestore}
        onDelete={onDelete}
        onBack={onBack}
      />,
    )

    fireEvent.click(view.getByRole('button', { name: 'Save plan' }))
    fireEvent.click(view.getByRole('button', { name: 'Restore' }))
    fireEvent.click(view.getByRole('button', { name: 'Delete' }))
    fireEvent.click(view.getByRole('button', { name: 'Back to workbench' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onRestore).toHaveBeenCalledWith(plan)
      expect(onDelete).toHaveBeenCalledWith('plan-1')
      expect(onBack).toHaveBeenCalledTimes(1)
    })
  })

  it('shows the retry state without rendering an empty success state', () => {
    const onRetry = vi.fn()
    const view = render(
      <HistoryPage
        labels={labels}
        plans={[]}
        loadFailed
        onRetry={onRetry}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        onBack={vi.fn()}
      />,
    )

    expect(view.getByTestId('history-load-error')).toBeTruthy()
    expect(view.queryByTestId('history-empty-state')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('does not delete a plan when confirmation is cancelled', () => {
    const onDelete = vi.fn()
    vi.stubGlobal('confirm', vi.fn(() => false))
    const view = render(
      <HistoryPage
        labels={labels}
        plans={[plan]}
        loadFailed={false}
        onRetry={vi.fn()}
        onSave={vi.fn()}
        onRestore={vi.fn()}
        onDelete={onDelete}
        onBack={vi.fn()}
      />,
    )

    fireEvent.click(view.getByRole('button', { name: 'Delete' }))

    expect(onDelete).not.toHaveBeenCalled()
  })

  it('keeps save and delete failures visible to the user', async () => {
    const alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    vi.stubGlobal('confirm', vi.fn(() => true))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(
      <HistoryPage
        labels={labels}
        plans={[plan]}
        loadFailed={false}
        onRetry={vi.fn()}
        onSave={vi.fn().mockRejectedValue(new Error('save failed'))}
        onRestore={vi.fn()}
        onDelete={vi.fn().mockRejectedValue(new Error('delete failed'))}
        onBack={vi.fn()}
      />,
    )

    fireEvent.click(view.getByRole('button', { name: 'Save plan' }))
    fireEvent.click(view.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith('Failed to save plan')
      expect(alertMock).toHaveBeenCalledWith('Failed to delete')
    })
  })
})
