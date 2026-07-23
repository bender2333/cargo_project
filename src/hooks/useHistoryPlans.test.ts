import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteHistoryPlan, readHistoryPlans, saveHistoryPlan } from '../api/historyPlans'
import type { HistoryPlan, SaveHistoryPlanInput } from '../api/historyPlans'
import { useHistoryPlans } from './useHistoryPlans'

vi.mock('../api/historyPlans', () => ({
  deleteHistoryPlan: vi.fn(),
  readHistoryPlans: vi.fn(),
  saveHistoryPlan: vi.fn(),
}))

const mockedDelete = vi.mocked(deleteHistoryPlan)
const mockedRead = vi.mocked(readHistoryPlans)
const mockedSave = vi.mocked(saveHistoryPlan)

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
  placedCount: 0,
  totalCargoCount: 0,
  layerCount: 0,
  labelSummary: '',
}

const saveInput: SaveHistoryPlanInput = {
  projectName: 'Project',
  shipmentName: 'Shipment',
  loadingMode: 'quantity',
  data: {
    containerId: plan.containerId,
    container: plan.container,
    cargoItems: [],
    placedCount: 0,
    totalCargoCount: 0,
    layerCount: 0,
    labelSummary: '',
  },
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
  mockedDelete.mockReset()
  mockedRead.mockReset()
  mockedSave.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useHistoryPlans', () => {
  it('issues one eager history read when React StrictMode replays effects', async () => {
    mockedRead.mockResolvedValue([])

    renderHook(() => useHistoryPlans(), { wrapper: StrictMode })

    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(1))
  })

  it('loads plans once and exposes save/delete commands through the API boundary', async () => {
    mockedRead.mockResolvedValue([plan])
    mockedSave.mockResolvedValue()
    mockedDelete.mockResolvedValue()

    const { result } = renderHook(() => useHistoryPlans())
    await waitFor(() => expect(result.current.plans).toEqual([plan]))

    await act(async () => {
      await result.current.save(saveInput)
      await result.current.remove('plan-1')
    })

    expect(mockedSave).toHaveBeenCalledWith(saveInput)
    expect(mockedDelete).toHaveBeenCalledWith('plan-1')
    expect(mockedRead).toHaveBeenCalledTimes(3)
  })

  it('keeps the newest refresh when an older response finishes last', async () => {
    const stale = deferred<HistoryPlan[]>()
    mockedRead
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([plan])

    const { result } = renderHook(() => useHistoryPlans())
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(1))

    let newestRefresh!: Promise<void>
    act(() => {
      void result.current.refresh()
      newestRefresh = result.current.refresh()
    })
    await act(async () => {
      await newestRefresh
    })
    expect(result.current.plans).toEqual([plan])

    await act(async () => {
      stale.resolve([])
      await stale.promise
    })
    expect(result.current.plans).toEqual([plan])
    expect(result.current.loadFailed).toBe(false)
  })

  it('ignores an older refresh failure after a newer list succeeds', async () => {
    const stale = deferred<HistoryPlan[]>()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedRead
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([plan])

    const { result } = renderHook(() => useHistoryPlans())
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(1))

    let staleRefresh!: Promise<void>
    let newestRefresh!: Promise<void>
    act(() => {
      staleRefresh = result.current.refresh()
      newestRefresh = result.current.refresh()
    })
    await act(async () => {
      await newestRefresh
    })
    await act(async () => {
      stale.reject(new Error('stale history failure'))
      await staleRefresh
    })

    expect(result.current.plans).toEqual([plan])
    expect(result.current.loadFailed).toBe(false)
  })

  it('reports a post-save refresh failure as a list failure, not a write failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedRead
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('history refresh failed'))
    mockedSave.mockResolvedValue()

    const { result } = renderHook(() => useHistoryPlans())
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(1))

    await act(async () => {
      await expect(result.current.save(saveInput)).resolves.toBeUndefined()
    })

    expect(mockedSave).toHaveBeenCalledWith(saveInput)
    expect(result.current.loadFailed).toBe(true)
  })
})
