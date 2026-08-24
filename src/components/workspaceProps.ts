import type { DragEvent as ReactDragEvent } from 'react'
import type { ContainerSpec, Locale, PackingResult, PlacedBox } from '../types'
import type {
  ManualDraft,
  ManualRotationDirection,
  OrientationKey,
  PoolEntry,
  ValidationIssue,
} from '../lib/manualPlacement'
import type { ManualOperationNotice } from '../lib/manualFeedback'
import type { PlacementSettings } from '../lib/placementSettings'
import type { ClearanceAnnotation } from '../lib/measurement'
import type { CogOverlay } from '../lib/cogVisual'
import type { PlaybackSequence } from '../lib/playback'
import type { SceneViewMode } from './ContainerScene'
import type { PlanViewMode } from './ContainerPlan2D'

export type WorkspaceView = '3d' | '2d'
export type PlacementMode = 'auto' | 'manual'

export type HoverInfo = {
  id: string
  label: string
  length: number
  width: number
  height: number
  orientationKey: OrientationKey
  x: number
  y: number
  z: number
  clientX: number
  clientY: number
}

export type PoolDragInfo = {
  cargoId: string
  length: number
  width: number
  height: number
  color: string
}

export type VisualizationChrome = {
  workspaceMaximized: boolean
  workspaceView: WorkspaceView
  sceneViewMode: SceneViewMode
  planViewMode: PlanViewMode
  clearanceEnabled: boolean
}

export type ManualWorkspaceProps = {
  manualNotice: ManualOperationNotice | null
  setManualNotice: (notice: ManualOperationNotice | null) => void
  rotationNotice: string
  setRotationNotice: (notice: string) => void
  manualIssues: ValidationIssue[]
  localizeManualIssue: (issue: ValidationIssue) => string
  manualPool: PoolEntry[]
  handleManualPoolDragStart: (event: ReactDragEvent<HTMLDivElement>, cargoId: string) => void
  handleManualPoolDragEnd: () => void
  handleQuickPlaceCargo: (cargoId: string) => void
  manualHelpOpen: boolean
  setManualHelpOpen: (fn: (current: boolean) => boolean) => void
  automaticPlaced: readonly PlacedBox[]
  manualPlacedBoxes: readonly PlacedBox[]
  manualInvalidBoxIds: Set<string>
  poolDragInfo: PoolDragInfo | null
  manualSelectedId: string | null
  selectManualBox: (id: string | null) => void
  setHoverInfo: (info: HoverInfo | null) => void
  handleManualDeleteBox: (boxId: string) => void
  handleManualDropFromPool: (cargoId: string, x: number, y: number, z?: number) => void
  handleManualMoveBox: (boxId: string, x: number, y: number, z?: number) => void
  notifyManualRejected: (
    operation: 'move' | 'drop' | 'rotate' | 'delete',
    boxId?: string,
    cargoId?: string,
    issues?: ValidationIssue[],
    reasonCode?: ManualOperationNotice['reasonCode'],
  ) => void
  handleManualRotateBox: (boxId: string, direction?: ManualRotationDirection) => void
  undoManualPlacement: () => void
  redoManualPlacement: () => void
  clearanceAnnotations: ClearanceAnnotation[]
  manualDraft: ManualDraft
  autoHelpOpen: boolean
  setAutoHelpOpen: (fn: (current: boolean) => boolean) => void
  hoverInfo: HoverInfo | null
}

export type PlaybackWorkspaceProps = {
  playbackActive: boolean
  playbackSequence: PlaybackSequence
  playbackCursor: number
  loadingStepsActive: boolean
  activeLoadingGroupBoxIds: Set<string> | undefined
}

export type SceneRenderWorkspaceProps = {
  placementMode: PlacementMode
  setPlacementMode: (mode: PlacementMode) => void
  renderingContainer: ContainerSpec
  gridSnap: boolean
  edgeSnap: boolean
  placementSettings: PlacementSettings
}

export type VisualSelectionWorkspaceProps = {
  activeLabelId: string
  activeLayerId: string
  cogViewState: { boxOpacity: number | null; showOverlay: boolean }
  cogOverlay: CogOverlay | null
  selectedBoxId: string | null
  setSelectedBoxId: (id: string | null) => void
}

export type VisualizationWorkspaceTranslationKeys = {
  loaded: string
  weight: string
  weightUse: string
  volumeUse: string
  autoMode: string
  manualMode: string
  continueManually: string
  view2d: string
  view3d: string
  topView: string
  frontView: string
  sideView: string
  isoView: string
  resetView: string
  clearanceTitle: string
  exportView: string
  dismissNotice: string
  manualIssues: string
  placementPool: string
  poolEmpty: string
  poolRemaining: string
  quickPlace: string
  restoreManual: string
  maximizeManual: string
  manualKeyboardHelp: string
  manualKeyboardHelpItems: string[]
  autoKeyboardHelp: string
  autoKeyboardHelpItems: string[]
  load: string
  hoverTooltipLabel: string
  hoverTooltipSize: string
  hoverTooltipOrientation: string
  hoverTooltipPosition: string
  manualIssueBoundary: string
  manualIssueOverlap: string
  manualIssueFloating: string
  manualIssueRotationDisabled: string
  manualIssueStacking: string
  manualIssueMaxStackLayers: string
}

/** Aggregated workspace props: 4 domain objects + residual top-level fields. */
export type VisualizationWorkspaceProps = {
  activeResult: PackingResult
  formatCubicMeters: (volume: number) => string
  t: VisualizationWorkspaceTranslationKeys
  hasCalculated: boolean
  handleContinueManually: () => void
  exportCurrentViewDisabled: boolean
  exportCurrentViewDisabledReason?: string | null
  exportShipmentName: string
  onExportView: (operation: () => Promise<void> | void) => Promise<void>
  containerChangeNotice: string
  customContainerLoadFailed: boolean
  locale: Locale
  calculateAndShowPlacement: () => void
  onChromeChange?: (chrome: VisualizationChrome) => void
  hotkeysEnabled: boolean
  manual: ManualWorkspaceProps
  playback: PlaybackWorkspaceProps
  render: SceneRenderWorkspaceProps
  selection: VisualSelectionWorkspaceProps
}
