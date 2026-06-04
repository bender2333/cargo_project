import type { CargoItem, ContainerSpec, LoadingMode, PackingResult } from '../types'
import { createClientId } from './clientId'

export type HistoryPlan = {
  id: string
  createdAt: string
  projectName: string
  shipmentName: string
  containerId: string
  container: ContainerSpec
  cargoItems: CargoItem[]
  placedCount: number
  totalCargoCount: number
  layerCount: number
  labelSummary: string
  loadingMode: LoadingMode
  defaultMaxStackLayers?: number
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const storageKey = 'cargo-packing-history'

export function createHistoryPlan(
  container: ContainerSpec,
  cargoItems: CargoItem[],
  result: PackingResult,
  options: { createId?: () => string; now?: () => Date; shipmentName?: string; projectName?: string; loadingMode?: LoadingMode; defaultMaxStackLayers?: number } = {},
): HistoryPlan {
  const createId = options.createId ?? createClientId
  const now = options.now ?? (() => new Date())

  return {
    id: createId(),
    createdAt: now().toISOString(),
    projectName: options.projectName?.trim() || '新装箱项目',
    shipmentName: options.shipmentName?.trim() || 'Untitled shipment',
    containerId: container.id,
    container: { ...container },
    cargoItems: cargoItems.map((item) => ({ ...item })),
    placedCount: result.placedCount,
    totalCargoCount: result.totalCargoCount,
    layerCount: result.layers.length,
    labelSummary: result.labelStats.map((item) => `${item.label}:${item.placed}/${item.planned}`).join(', '),
    loadingMode: options.loadingMode || 'volume',
    defaultMaxStackLayers: options.defaultMaxStackLayers,
  }
}

export function readHistoryPlans(storage: StorageLike): HistoryPlan[] {
  const raw = storage.getItem(storageKey)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item): item is HistoryPlan => Boolean(item?.id && item?.containerId && item?.container && Array.isArray(item?.cargoItems)))
      .map((item) => ({
        ...item,
        projectName: item.projectName || '新装箱项目',
        shipmentName: item.shipmentName || 'Untitled shipment',
        loadingMode: item.loadingMode || 'volume',
        defaultMaxStackLayers: item.defaultMaxStackLayers,
      }))
  } catch {
    return []
  }
}

export function saveHistoryPlan(storage: StorageLike, plan: HistoryPlan, limit = 5): HistoryPlan[] {
  const next = [plan, ...readHistoryPlans(storage).filter((item) => item.id !== plan.id)].slice(0, limit)
  storage.setItem(storageKey, JSON.stringify(next))
  return next
}

