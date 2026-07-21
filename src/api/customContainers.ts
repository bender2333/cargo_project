import type { ContainerSpec } from '../types'
import { fetchWithAuth } from './client'

type CustomContainerDto = {
  id: string
  name: string
  length: number
  width: number
  height: number
  max_weight: number
  door_gap: number
  top_gap: number
  side_gap: number
}

export type CustomContainerPayload = {
  name: string
  length: number
  width: number
  height: number
  maxWeight: number
  doorGap: number
  topGap: number
  sideGap: number
}

async function writeCustomContainer(
  path: string,
  method: 'POST' | 'PUT',
  payload: CustomContainerPayload,
): Promise<void> {
  const response = await fetchWithAuth(path, {
    method,
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || '保存失败')
  }
}

export async function readCustomContainers(): Promise<ContainerSpec[]> {
  const response = await fetchWithAuth('/api/containers/custom')
  if (!response.ok) throw new Error('柜型加载失败')
  const data = await response.json() as CustomContainerDto[]
  return data.map((item) => ({
    id: item.id,
    label: item.name,
    description: `自定义柜型: ${item.name} (${item.length}x${item.width}x${item.height}mm)`,
    length: item.length,
    width: item.width,
    height: item.height,
    maxWeight: item.max_weight,
    doorGap: item.door_gap,
    topGap: item.top_gap,
    sideGap: item.side_gap,
  }))
}

export function createCustomContainer(payload: CustomContainerPayload): Promise<void> {
  return writeCustomContainer('/api/containers/custom', 'POST', payload)
}

export function updateCustomContainer(id: string, payload: CustomContainerPayload): Promise<void> {
  return writeCustomContainer(`/api/containers/custom/${id}`, 'PUT', payload)
}

export async function deleteCustomContainer(id: string): Promise<void> {
  const response = await fetchWithAuth(`/api/containers/custom/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('删除失败')
}
