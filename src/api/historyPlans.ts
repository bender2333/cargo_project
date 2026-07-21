import type { CargoItem, ContainerSpec, LoadingMode } from '../types'
import { fetchWithAuth } from './client'

export type HistoryPlanData = {
  containerId: string
  container: ContainerSpec
  cargoItems: CargoItem[]
  placedCount: number
  totalCargoCount: number
  layerCount: number
  labelSummary: string
  defaultMaxStackLayers?: number
}

export type HistoryPlan = HistoryPlanData & {
  id: string
  createdAt: string
  projectName: string
  shipmentName: string
  loadingMode: LoadingMode
}

export type SaveHistoryPlanInput = {
  projectName: string
  shipmentName: string
  loadingMode: LoadingMode
  data: HistoryPlanData
}

type HistoryPlanDto = {
  id: string
  created_at: string
  project_name: string
  shipment_name: string | null
  loading_mode: LoadingMode
  data: HistoryPlanData
}

export async function readHistoryPlans(): Promise<HistoryPlan[]> {
  const response = await fetchWithAuth('/api/history')
  if (!response.ok) throw new Error('历史方案加载失败')
  const data = await response.json() as HistoryPlanDto[]
  return data.map((item) => ({
    ...item.data,
    id: item.id,
    createdAt: item.created_at,
    projectName: item.project_name,
    shipmentName: item.shipment_name ?? '',
    loadingMode: item.loading_mode,
  }))
}

export async function saveHistoryPlan(input: SaveHistoryPlanInput): Promise<void> {
  const response = await fetchWithAuth('/api/history', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error('保存历史方案失败')
}

export async function deleteHistoryPlan(id: string): Promise<void> {
  const response = await fetchWithAuth(`/api/history/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('删除失败')
}
