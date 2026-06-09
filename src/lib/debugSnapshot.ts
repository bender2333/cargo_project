import type { User } from './auth'
import type { ManualDraft, PoolEntry, ValidationIssue } from './manualPlacement'
import type { ManualOperationNotice } from './manualFeedback'
import type { MeasurementAnnotation } from './measurement'
import type { PlacementSettings } from './placementSettings'
import type { RemainingCapacity } from './remainingCapacity'
import type {
  CargoItem,
  ContainerSpec,
  LoadingMode,
  Locale,
  PackingDiagnostic,
  PlacedBox,
  UnplacedCargo,
} from '../types'

export type DebugSceneViewMode = 'iso' | 'top' | 'front' | 'side'
export type DebugPlanViewMode = 'top' | 'front' | 'side'

export type CargoDebugSnapshot = {
  schemaVersion: 1
  capturedAt: string
  user: User | null
  locale: Locale
  project: {
    name: string
    shipmentName: string
  }
  mode: {
    placement: 'auto' | 'manual'
    workspaceView: '2d' | '3d'
    sceneViewMode: DebugSceneViewMode
    planViewMode: DebugPlanViewMode
    activeResultTab: string
    activeLayerId: string
    activeLabelId: string
  }
  container: {
    selected: ContainerSpec
    effective: ContainerSpec
  }
  loadingMode: LoadingMode
  defaultMaxStackLayers?: number
  cargo: {
    count: number
    items: CargoItem[]
  }
  placementSettings: PlacementSettings
  automatic: {
    hasCalculated: boolean
    placedBoxes: PlacedBox[]
    visibleBoxes: PlacedBox[]
    unplaced: UnplacedCargo[]
    diagnostics: PackingDiagnostic[]
    layersCount: number
    placedCount: number
    totalCargoCount: number
  }
  manual: {
    draft: ManualDraft
    placedBoxes: PlacedBox[]
    pool: PoolEntry[]
    issues: ValidationIssue[]
    invalidBoxIds: string[]
    selectedBoxId: string | null
    notice: ManualOperationNotice | null
    capacity: RemainingCapacity
  }
  measurements: MeasurementAnnotation[]
  ui: {
    gridSnap: boolean
    edgeSnap: boolean
    clearanceEnabled: boolean
    workspaceMaximized: boolean
  }
  historyCount: number
  recentErrors: string[]
  summary: {
    cargoItemsCount: number
    placedCount: number
    totalCargoCount: number
    layersCount: number
    manualBoxesCount: number
    historyCount: number
  }
  recovery: {
    testHelper: 'restoreManualDebugScenario'
    notes: string[]
  }
}

export type BuildCargoDebugSnapshotInput = {
  user: User | null
  locale: Locale
  projectName: string
  shipmentName: string
  placementMode: 'auto' | 'manual'
  workspaceView: '2d' | '3d'
  sceneViewMode: DebugSceneViewMode
  planViewMode: DebugPlanViewMode
  activeResultTab: string
  activeLayerId: string
  activeLabelId: string
  selectedContainer: ContainerSpec
  effectiveContainer: ContainerSpec
  loadingMode: LoadingMode
  defaultMaxStackLayers?: number
  cargoItems: CargoItem[]
  placementSettings: PlacementSettings
  hasCalculated: boolean
  automatic: {
    placedBoxes: PlacedBox[]
    visibleBoxes: PlacedBox[]
    unplaced: UnplacedCargo[]
    diagnostics: PackingDiagnostic[]
    layersCount: number
    placedCount: number
    totalCargoCount: number
  }
  manual: {
    draft: ManualDraft
    placedBoxes: PlacedBox[]
    pool: PoolEntry[]
    issues: ValidationIssue[]
    invalidBoxIds: string[]
    selectedBoxId: string | null
    notice: ManualOperationNotice | null
    capacity: RemainingCapacity
  }
  measurements: MeasurementAnnotation[]
  ui: {
    gridSnap: boolean
    edgeSnap: boolean
    clearanceEnabled: boolean
    workspaceMaximized: boolean
  }
  historyCount: number
  recentErrors: string[]
  capturedAt?: string
}

export function buildCargoDebugSnapshot(input: BuildCargoDebugSnapshotInput): CargoDebugSnapshot {
  return {
    schemaVersion: 1,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    user: input.user,
    locale: input.locale,
    project: {
      name: input.projectName,
      shipmentName: input.shipmentName,
    },
    mode: {
      placement: input.placementMode,
      workspaceView: input.workspaceView,
      sceneViewMode: input.sceneViewMode,
      planViewMode: input.planViewMode,
      activeResultTab: input.activeResultTab,
      activeLayerId: input.activeLayerId,
      activeLabelId: input.activeLabelId,
    },
    container: {
      selected: input.selectedContainer,
      effective: input.effectiveContainer,
    },
    loadingMode: input.loadingMode,
    defaultMaxStackLayers: input.defaultMaxStackLayers,
    cargo: {
      count: input.cargoItems.length,
      items: input.cargoItems,
    },
    placementSettings: input.placementSettings,
    automatic: {
      hasCalculated: input.hasCalculated,
      ...input.automatic,
    },
    manual: input.manual,
    measurements: input.measurements,
    ui: input.ui,
    historyCount: input.historyCount,
    recentErrors: input.recentErrors,
    summary: {
      cargoItemsCount: input.cargoItems.length,
      placedCount: input.automatic.placedCount,
      totalCargoCount: input.automatic.totalCargoCount,
      layersCount: input.automatic.layersCount,
      manualBoxesCount: input.manual.draft.boxes.length,
      historyCount: input.historyCount,
    },
    recovery: {
      testHelper: 'restoreManualDebugScenario',
      notes: [
        'Use cargo.items, container.effective, placementSettings, and manual.draft to recreate the manual workspace.',
        'Run validateDraft(manualDraft, container.effective, placementSettings.supportPolicy) to reproduce placement issues.',
      ],
    },
  }
}

export function restoreManualDebugScenario(snapshot: CargoDebugSnapshot) {
  return {
    container: snapshot.container.effective,
    selectedContainer: snapshot.container.selected,
    cargoItems: snapshot.cargo.items,
    defaultMaxStackLayers: snapshot.defaultMaxStackLayers,
    placementSettings: snapshot.placementSettings,
    manualDraft: snapshot.manual.draft,
    expectedIssues: snapshot.manual.issues,
    measurements: snapshot.measurements,
    selectedBoxId: snapshot.manual.selectedBoxId,
  }
}
