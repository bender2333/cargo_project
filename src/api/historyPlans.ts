import type { LoadingMode } from '../types'
import type { HistoryPlanData } from '../lib/historySnapshot'
import { assertHistorySnapshotSize, assertValidHistoryPlanData } from '../lib/historySnapshot'
import { fetchWithAuth } from './client'

export type { HistoryPlanData } from '../lib/historySnapshot'

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


const LOADING_MODES: LoadingMode[] = ['volume', 'weight', 'quantity', 'input']

function historyPlanFromDto(value: unknown, index: number): HistoryPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`History row ${index} must be an object`)
  const item = value as Record<string, unknown>
  const id = typeof item.id === 'string' ? item.id : null
  const createdAt = typeof item.created_at === 'string' ? item.created_at : null
  const projectName = typeof item.project_name === 'string' ? item.project_name : null
  if (!id || !id.trim() || !createdAt || !createdAt.trim() || Number.isNaN(Date.parse(createdAt)) || !projectName || !projectName.trim()) {
    throw new Error(`History row ${index} has invalid metadata`)
  }
  if (item.shipment_name !== null && typeof item.shipment_name !== 'string') throw new Error(`History row ${index} has invalid shipment_name`)
  if (!LOADING_MODES.includes(item.loading_mode as LoadingMode)) throw new Error(`History row ${index} has invalid loading_mode`)
  assertValidHistoryPlanData(item.data)
  return {
    ...item.data,
    id,
    createdAt,
    projectName,
    shipmentName: item.shipment_name ?? '',
    loadingMode: item.loading_mode as LoadingMode,
  }
}

export async function readHistoryPlans(): Promise<HistoryPlan[]> {
  const response = await fetchWithAuth('/api/history')
  if (!response.ok) throw new Error('历史方案加载失败')
  const data: unknown = await response.json()
  if (!Array.isArray(data)) throw new Error('History response must be an array')
  return data.map(historyPlanFromDto)
}

export async function saveHistoryPlan(input: SaveHistoryPlanInput): Promise<void> {
  assertValidHistoryPlanData(input.data)
  if (typeof input.projectName !== 'string' || !input.projectName.trim()) throw new Error('projectName is required')
  if (typeof input.shipmentName !== 'string') throw new Error('shipmentName must be a string')
  if (!LOADING_MODES.includes(input.loadingMode)) throw new Error('loadingMode has an illegal value')
  assertHistorySnapshotSize(input.data)
  const response = await fetchWithAuth('/api/history', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || '保存历史方案失败')
  }
}

export async function deleteHistoryPlan(id: string): Promise<void> {
  const response = await fetchWithAuth(`/api/history/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('删除失败')
}
