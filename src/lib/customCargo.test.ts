import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CargoItem } from '../types'
import {
  deleteCustomCargo,
  readCustomCargo,
  saveCustomCargo,
  updateCustomCargo,
} from './customCargo'
import { fetchWithAuth } from './auth'

vi.mock('./auth', () => ({
  fetchWithAuth: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchWithAuth)

const cargo: CargoItem = {
  id: 'cargo-1',
  name: 'Library crate',
  label: 'LC',
  length: 1200,
  width: 800,
  height: 600,
  weight: 42,
  quantity: 5,
  color: '#f97316',
  canRotate: false,
  stackable: true,
  maxStackLayers: 3,
}

describe('customCargo api client', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('reads custom cargo from the user-scoped backend route', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify([cargo]), { status: 200 }))

    await expect(readCustomCargo()).resolves.toEqual([cargo])
    expect(mockedFetch).toHaveBeenCalledWith('/api/custom-cargo')
  })

  it('saves cargo without persisting the current workbench quantity', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ ...cargo, quantity: 1 }), { status: 201 }))

    await expect(saveCustomCargo(cargo)).resolves.toMatchObject({ quantity: 1 })
    expect(mockedFetch).toHaveBeenCalledWith('/api/custom-cargo', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Library crate',
        label: 'LC',
        length: 1200,
        width: 800,
        height: 600,
        weight: 42,
        color: '#f97316',
        canRotate: false,
        stackable: true,
        maxStackLayers: 3,
      }),
    })
  })

  it('updates and deletes cargo by id', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(cargo), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'deleted' }), { status: 200 }))

    await expect(updateCustomCargo('cargo-1', cargo)).resolves.toEqual(cargo)
    await expect(deleteCustomCargo('cargo-1')).resolves.toBe(true)

    expect(mockedFetch).toHaveBeenNthCalledWith(1, '/api/custom-cargo/cargo-1', {
      method: 'PUT',
      body: expect.any(String),
    })
    expect(mockedFetch).toHaveBeenNthCalledWith(2, '/api/custom-cargo/cargo-1', {
      method: 'DELETE',
    })
  })
})
