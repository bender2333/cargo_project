import type { CargoItem, ContainerSpec, LoadingMode, PackingResult } from '../types'
import type { ManualDraft } from './manualPlacement'

export const HISTORY_SNAPSHOT_VERSION = 2 as const
/** Soft guard so oversized plans fail visibly instead of blowing the API. */
export const HISTORY_SNAPSHOT_MAX_BYTES = 2_500_000

export type HistorySnapshotV2 = {
  schemaVersion: typeof HISTORY_SNAPSHOT_VERSION
  containerId: string
  container: ContainerSpec
  cargoItems: CargoItem[]
  placedCount: number
  totalCargoCount: number
  layerCount: number
  labelSummary: string
  defaultMaxStackLayers?: number
  placementMode: 'auto' | 'manual'
  packingResult: PackingResult
  manualDraft?: ManualDraft
  draftInitialized?: boolean
}

export type LegacyHistoryPlanData = {
  schemaVersion?: undefined
  containerId: string
  container: ContainerSpec
  cargoItems: CargoItem[]
  placedCount: number
  totalCargoCount: number
  layerCount: number
  labelSummary: string
  defaultMaxStackLayers?: number
}

export type HistoryPlanData = HistorySnapshotV2 | LegacyHistoryPlanData

export type BuildHistorySnapshotInput = {
  container: ContainerSpec
  cargoItems: CargoItem[]
  packingResult: PackingResult
  placementMode: 'auto' | 'manual'
  defaultMaxStackLayers?: number
  manualDraft?: ManualDraft
  draftInitialized?: boolean
}

export function isHistorySnapshotV2(data: HistoryPlanData | null | undefined): data is HistorySnapshotV2 {
  return Boolean(data && typeof data === 'object' && (data as HistorySnapshotV2).schemaVersion === HISTORY_SNAPSHOT_VERSION)
}

export function buildHistorySnapshot(input: BuildHistorySnapshotInput): HistorySnapshotV2 {
  const { packingResult } = input
  return {
    schemaVersion: HISTORY_SNAPSHOT_VERSION,
    containerId: input.container.id,
    container: input.container,
    cargoItems: input.cargoItems,
    placedCount: packingResult.placedCount,
    totalCargoCount: packingResult.totalCargoCount,
    layerCount: packingResult.layers.length,
    labelSummary: packingResult.labelStats.map((item) => `${item.label}:${item.placed}/${item.planned}`).join(', '),
    defaultMaxStackLayers: input.defaultMaxStackLayers,
    placementMode: input.placementMode,
    packingResult,
    manualDraft: input.placementMode === 'manual' ? input.manualDraft : undefined,
    draftInitialized: input.placementMode === 'manual' ? input.draftInitialized : undefined,
  }
}

export function measureHistorySnapshotBytes(data: HistoryPlanData): number {
  return new TextEncoder().encode(JSON.stringify(data)).length
}

export function assertHistorySnapshotSize(data: HistoryPlanData): void {
  const bytes = measureHistorySnapshotBytes(data)
  if (bytes > HISTORY_SNAPSHOT_MAX_BYTES) {
    throw new Error(`History snapshot exceeds ${HISTORY_SNAPSHOT_MAX_BYTES} bytes (${bytes})`)
  }
}

export type RestoreHistoryDecision =
  | { kind: 'snapshot'; data: HistorySnapshotV2 }
  | { kind: 'legacy-recompute'; data: LegacyHistoryPlanData }
  | { kind: 'invalid'; reason: string }

export function classifyHistoryRestore(data: unknown): RestoreHistoryDecision {
  if (!data || typeof data !== 'object') {
    return { kind: 'invalid', reason: 'Missing history plan data' }
  }
  const record = data as Record<string, unknown>
  if (!record.container || !Array.isArray(record.cargoItems)) {
    return { kind: 'invalid', reason: 'History plan is missing container or cargo items' }
  }
  if (record.schemaVersion == null) {
    return { kind: 'legacy-recompute', data: record as LegacyHistoryPlanData }
  }
  if (record.schemaVersion !== HISTORY_SNAPSHOT_VERSION) {
    return { kind: 'invalid', reason: `Unsupported history snapshot version: ${String(record.schemaVersion)}` }
  }
  const snapshot = record as HistorySnapshotV2
  if (!snapshot.packingResult || !Array.isArray(snapshot.packingResult.placed)) {
    return { kind: 'invalid', reason: 'History snapshot is missing packingResult.placed' }
  }
  return { kind: 'snapshot', data: snapshot }
}

export type RestoredHistorySession = {
  projectName: string
  shipmentName: string
  container: ContainerSpec
  cargoItems: CargoItem[]
  loadingMode: LoadingMode
  defaultMaxStackLayers?: number
  placementMode: 'auto' | 'manual'
  packingResult: PackingResult
  manualDraft?: ManualDraft
  draftInitialized?: boolean
  source: 'snapshot' | 'legacy-recompute'
}
