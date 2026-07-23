import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteCustomCargo,
  readCustomCargo,
  saveCustomCargo,
  updateCustomCargo,
} from '../api/customCargo'
import type { CargoItem } from '../types'
import { useCustomCargoLibrary } from './useCustomCargoLibrary'

vi.mock('../api/customCargo', () => ({
  deleteCustomCargo: vi.fn(),
  readCustomCargo: vi.fn(),
  saveCustomCargo: vi.fn(),
  updateCustomCargo: vi.fn(),
}))

const mockedDelete = vi.mocked(deleteCustomCargo)
const mockedRead = vi.mocked(readCustomCargo)
const mockedSave = vi.mocked(saveCustomCargo)
const mockedUpdate = vi.mocked(updateCustomCargo)

const cargo: CargoItem = {
  id: 'cargo-1',
  name: 'Crated machine',
  label: 'CM',
  length: 1200,
  width: 800,
  height: 1000,
  weight: 450,
  quantity: 1,
  color: '#2563eb',
  canRotate: true,
  stackable: true,
  maxStackLayers: 2,
  groundOnly: false,
}

const createdCargo: CargoItem = {
  ...cargo,
  id: 'cargo-2',
  name: 'Server-created pallet',
  label: 'SP',
}

const updatedCargo: CargoItem = {
  ...createdCargo,
  name: 'Server-normalized pallet',
  weight: 500,
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
  mockedUpdate.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCustomCargoLibrary', () => {
  it('issues one eager cargo read when React StrictMode replays effects', async () => {
    mockedRead.mockResolvedValue([])

    renderHook(() => useCustomCargoLibrary(), { wrapper: StrictMode })

    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(1))
  })

  it('runs every CRUD command through the API and refreshes from the authoritative list', async () => {
    mockedRead
      .mockResolvedValueOnce([cargo])
      .mockResolvedValueOnce([cargo, createdCargo])
      .mockResolvedValueOnce([cargo, updatedCargo])
      .mockResolvedValueOnce([updatedCargo])
    mockedSave.mockResolvedValue(createdCargo)
    mockedUpdate.mockResolvedValue(updatedCargo)
    mockedDelete.mockResolvedValue()

    const { result } = renderHook(() => useCustomCargoLibrary())
    await waitFor(() => expect(result.current.items).toEqual([cargo]))

    await act(async () => {
      await result.current.create(createdCargo)
    })
    expect(mockedSave).toHaveBeenCalledWith(createdCargo)
    expect(result.current.items).toEqual([cargo, createdCargo])

    await act(async () => {
      await result.current.update(createdCargo.id, updatedCargo)
    })
    expect(mockedUpdate).toHaveBeenCalledWith(createdCargo.id, updatedCargo)
    expect(result.current.items).toEqual([cargo, updatedCargo])

    await act(async () => {
      await result.current.remove(cargo.id)
    })
    expect(mockedDelete).toHaveBeenCalledWith(cargo.id)
    expect(result.current.items).toEqual([updatedCargo])
    expect(mockedRead).toHaveBeenCalledTimes(4)
  })

  it('keeps the newest refresh when an older successful response finishes last', async () => {
    const stale = deferred<CargoItem[]>()
    mockedRead
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([updatedCargo])

    const { result } = renderHook(() => useCustomCargoLibrary())
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(1))

    let newestRefresh!: Promise<void>
    act(() => {
      void result.current.refresh()
      newestRefresh = result.current.refresh()
    })
    await act(async () => {
      await newestRefresh
    })
    expect(result.current.items).toEqual([updatedCargo])

    await act(async () => {
      stale.resolve([cargo])
      await stale.promise
    })
    expect(result.current.items).toEqual([updatedCargo])
    expect(result.current.loadFailed).toBe(false)
  })

  it('ignores an older refresh failure after a newer list succeeds', async () => {
    const stale = deferred<CargoItem[]>()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedRead
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([updatedCargo])

    const { result } = renderHook(() => useCustomCargoLibrary())
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
      stale.reject(new Error('stale cargo failure'))
      await staleRefresh
    })

    expect(result.current.items).toEqual([updatedCargo])
    expect(result.current.loadFailed).toBe(false)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('reports a post-create refresh failure without rejecting the successful write', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockedRead
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('cargo refresh failed'))
    mockedSave.mockResolvedValue(createdCargo)

    const { result } = renderHook(() => useCustomCargoLibrary())
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(1))

    await act(async () => {
      await expect(result.current.create(createdCargo)).resolves.toBeUndefined()
    })

    expect(mockedSave).toHaveBeenCalledWith(createdCargo)
    expect(result.current.loadFailed).toBe(true)
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({
      message: 'cargo refresh failed',
    }))
  })

  it('does not start a refresh when a pending mutation finishes after unmount', async () => {
    const pendingSave = deferred<CargoItem>()
    mockedRead.mockResolvedValue([])
    mockedSave.mockReturnValue(pendingSave.promise)

    const { result, unmount } = renderHook(() => useCustomCargoLibrary())
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(1))

    let createPromise!: Promise<void>
    act(() => {
      createPromise = result.current.create(createdCargo)
    })
    expect(mockedSave).toHaveBeenCalledWith(createdCargo)

    unmount()
    await act(async () => {
      pendingSave.resolve(createdCargo)
      await createPromise
    })

    expect(mockedRead).toHaveBeenCalledTimes(1)
  })
})
