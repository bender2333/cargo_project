import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { fetchWithAuth } from './client'
import {
  deleteHistoryPlan,
  readHistoryPlans,
  saveHistoryPlan,
} from './historyPlans'
import type { SaveHistoryPlanInput } from './historyPlans'

vi.mock('./client', () => ({
  fetchWithAuth: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchWithAuth)

const container: ContainerSpec = {
  id: 'custom-container-1',
  label: 'Customer 40HQ',
  description: 'Customer container',
  length: 12000,
  width: 2350,
  height: 2680,
  maxWeight: 26500,
  doorGap: 80,
  topGap: 60,
  sideGap: 40,
}

const cargoItem: CargoItem = {
  id: 'cargo-1',
  name: 'History crate',
  label: 'H',
  length: 1000,
  width: 800,
  height: 600,
  weight: 42,
  quantity: 2,
  color: '#0ea5e9',
  canRotate: true,
  stackable: true,
  maxStackLayers: 2,
  groundOnly: false,
}

const planData = {
  containerId: container.id,
  container,
  cargoItems: [cargoItem],
  placedCount: 2,
  totalCargoCount: 2,
  layerCount: 1,
  labelSummary: 'H:2/2',
  defaultMaxStackLayers: 3,
}

const dto = {
  id: 'plan-1',
  created_at: '2026-07-21T00:00:00.000Z',
  project_name: 'History project',
  shipment_name: null,
  loading_mode: 'weight',
  data: {
    ...planData,
    id: 'shadow-plan',
    shipmentName: 'shadow shipment',
    loadingMode: 'input',
  },
}

const saveInput: SaveHistoryPlanInput = {
  projectName: 'History project',
  shipmentName: 'Shipment 1',
  loadingMode: 'weight',
  data: planData,
}

describe('history plan API', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('maps backend history DTOs into restorable domain snapshots', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify([
      dto,
      {
        ...dto,
        id: 'plan-2',
        project_name: 'Second history project',
        shipment_name: 'Shipment 2',
        loading_mode: 'quantity',
        data: planData,
      },
    ]), { status: 200 }))

    await expect(readHistoryPlans()).resolves.toEqual([
      {
        id: 'plan-1',
        createdAt: '2026-07-21T00:00:00.000Z',
        projectName: 'History project',
        shipmentName: '',
        loadingMode: 'weight',
        ...planData,
      },
      {
        ...planData,
        id: 'plan-2',
        createdAt: '2026-07-21T00:00:00.000Z',
        projectName: 'Second history project',
        shipmentName: 'Shipment 2',
        loadingMode: 'quantity',
      },
    ])
    expect(mockedFetch).toHaveBeenCalledWith('/api/history')
  })

  it('saves the complete history snapshot with the existing request contract', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ id: 'plan-1' }), { status: 201 }))

    await expect(saveHistoryPlan(saveInput)).resolves.toBeUndefined()
    expect(mockedFetch).toHaveBeenCalledWith('/api/history', {
      method: 'POST',
      body: JSON.stringify(saveInput),
    })
  })

  it('deletes one plan through the existing history endpoint', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'deleted' }), { status: 200 }))

    await expect(deleteHistoryPlan('plan-1')).resolves.toBeUndefined()
    expect(mockedFetch).toHaveBeenCalledWith('/api/history/plan-1', {
      method: 'DELETE',
    })
  })

  it('rejects list, save, and delete failures instead of reporting success', async () => {
    mockedFetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))

    await expect(readHistoryPlans()).rejects.toThrow('历史方案加载失败')
    await expect(saveHistoryPlan(saveInput)).rejects.toThrow('保存历史方案失败')
    await expect(deleteHistoryPlan('missing')).rejects.toThrow('删除失败')
  })
})
