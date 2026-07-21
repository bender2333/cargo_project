import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from './client'
import {
  createCustomContainer,
  deleteCustomContainer,
  readCustomContainers,
  updateCustomContainer,
} from './customContainers'
import type { CustomContainerPayload } from './customContainers'

vi.mock('./client', () => ({
  fetchWithAuth: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchWithAuth)

const dto = {
  id: 'container-1',
  name: 'Customer 40HQ',
  length: 12000,
  width: 2350,
  height: 2680,
  max_weight: 26500,
  door_gap: 80,
  top_gap: 60,
  side_gap: 40,
}

const payload: CustomContainerPayload = {
  name: 'Customer 40HQ',
  length: 12000,
  width: 2350,
  height: 2680,
  maxWeight: 26500,
  doorGap: 80,
  topGap: 60,
  sideGap: 40,
}

const mapped = {
  id: 'container-1',
  label: 'Customer 40HQ',
  description: '自定义柜型: Customer 40HQ (12000x2350x2680mm)',
  length: 12000,
  width: 2350,
  height: 2680,
  maxWeight: 26500,
  doorGap: 80,
  topGap: 60,
  sideGap: 40,
}

describe('custom container API', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('maps the backend DTO into the shared ContainerSpec contract', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify([dto]), { status: 200 }))

    await expect(readCustomContainers()).resolves.toEqual([mapped])
    expect(mockedFetch).toHaveBeenCalledWith('/api/containers/custom')
  })

  it('creates and updates containers with the existing camelCase payload', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify(dto), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(dto), { status: 200 }))

    await expect(createCustomContainer(payload)).resolves.toBeUndefined()
    await expect(updateCustomContainer('container-1', payload)).resolves.toBeUndefined()

    expect(mockedFetch).toHaveBeenNthCalledWith(1, '/api/containers/custom', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    expect(mockedFetch).toHaveBeenNthCalledWith(2, '/api/containers/custom/container-1', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  })

  it('rejects list failures instead of presenting an empty container list', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 500 }))

    await expect(readCustomContainers()).rejects.toThrow('柜型加载失败')
  })

  it('preserves backend save errors for the existing alert workflow', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Container name already exists' }), { status: 409 }))
      .mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }))

    await expect(createCustomContainer(payload)).rejects.toThrow('Container name already exists')
    await expect(updateCustomContainer('container-1', payload)).rejects.toThrow('保存失败')
  })

  it('deletes by id and rejects failures instead of reporting success', async () => {
    mockedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'deleted' }), { status: 200 }))
    await expect(deleteCustomContainer('container-1')).resolves.toBeUndefined()
    expect(mockedFetch).toHaveBeenNthCalledWith(1, '/api/containers/custom/container-1', {
      method: 'DELETE',
    })

    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Container not found' }), { status: 404 }))

    await expect(deleteCustomContainer('missing')).rejects.toThrow('删除失败')
    expect(mockedFetch).toHaveBeenNthCalledWith(2, '/api/containers/custom/missing', {
      method: 'DELETE',
    })
  })
})
