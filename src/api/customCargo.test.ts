import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CargoItem } from '../types'
import { fetchWithAuth } from './client'
import {
  deleteCustomCargo,
  readCustomCargo,
  saveCustomCargo,
  updateCustomCargo,
} from './customCargo'

vi.mock('./client', () => ({
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
  quantity: 1,
  color: '#f97316',
  canRotate: false,
  stackable: true,
  maxStackLayers: 3,
  groundOnly: true,
}

const dto = {
  ...cargo,
  createdAt: '2026-07-22T00:00:00.000Z',
}

const workbenchCargo: CargoItem = {
  ...cargo,
  quantity: 5,
}

const expectedPayload = {
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
  groundOnly: true,
}

describe('custom cargo API', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('maps backend DTOs into CargoItem values without transport metadata', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify([dto]), { status: 200 }))

    await expect(readCustomCargo()).resolves.toEqual([cargo])
    expect(mockedFetch).toHaveBeenCalledWith('/api/custom-cargo')
  })

  it('saves cargo without persisting the current workbench quantity', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify(dto), { status: 201 }))

    await expect(saveCustomCargo(workbenchCargo)).resolves.toEqual(cargo)
    expect(mockedFetch).toHaveBeenCalledWith('/api/custom-cargo', {
      method: 'POST',
      body: JSON.stringify(expectedPayload),
    })
  })

  it('omits optional values so backend defaults remain authoritative', async () => {
    const cargoWithDefaults: CargoItem = {
      ...workbenchCargo,
      label: undefined,
      maxStackLayers: undefined,
      groundOnly: undefined,
    }
    const defaultedCargo: CargoItem = {
      ...cargo,
      label: 'LI',
      maxStackLayers: undefined,
      groundOnly: false,
    }
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({
      ...dto,
      ...defaultedCargo,
    }), { status: 201 }))

    await expect(saveCustomCargo(cargoWithDefaults)).resolves.toEqual(defaultedCargo)
    const requestBody = JSON.parse(String(mockedFetch.mock.calls[0][1]?.body))
    expect(requestBody).not.toHaveProperty('label')
    expect(requestBody).not.toHaveProperty('maxStackLayers')
    expect(requestBody).not.toHaveProperty('groundOnly')
  })

  it('updates and deletes cargo by id through the existing endpoints', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(dto), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'deleted' }), { status: 200 }))

    await expect(updateCustomCargo('cargo-1', workbenchCargo)).resolves.toEqual(cargo)
    await expect(deleteCustomCargo('cargo-1')).resolves.toBeUndefined()

    expect(mockedFetch).toHaveBeenNthCalledWith(1, '/api/custom-cargo/cargo-1', {
      method: 'PUT',
      body: JSON.stringify(expectedPayload),
    })
    expect(mockedFetch).toHaveBeenNthCalledWith(2, '/api/custom-cargo/cargo-1', {
      method: 'DELETE',
    })
  })

  it('rejects list, save, update, and delete failures instead of reporting success', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(readCustomCargo()).rejects.toThrow('货物库加载失败')
    await expect(saveCustomCargo(workbenchCargo)).rejects.toThrow('保存货物失败')
    await expect(updateCustomCargo('missing', workbenchCargo)).rejects.toThrow('保存货物失败')
    await expect(deleteCustomCargo('missing')).rejects.toThrow('删除货物失败')
  })
})
