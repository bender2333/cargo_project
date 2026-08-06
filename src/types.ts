export type ContainerSpec = {
  id: string
  label: string
  description: string
  length: number
  width: number
  height: number
  maxWeight: number
  doorGap: number
  topGap: number
  sideGap: number
}

export type CargoItem = {
  id: string
  name: string
  label?: string
  length: number
  width: number
  height: number
  weight: number
  quantity: number
  color: string
  canRotate: boolean
  stackable: boolean
  maxStackLayers?: number
  groundOnly?: boolean
}

/** Placement geometry while it is being built; final loading depth is derived later. */
export type PlacementBox = {
  id: string
  cargoId: string
  name: string
  label: string
  index: number
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  orientationKey: 'LWH' | 'WLH' | 'LHW' | 'HLW' | 'WHL' | 'HWL'
  labelRotationDeg: 0 | 90 | 180 | 270
  yawQuarterTurn?: 0 | 1 | 2 | 3
  pitchQuarterTurn?: 0 | 1 | 2 | 3
  orientationAxes?: {
    x: 'L+' | 'L-' | 'W+' | 'W-' | 'H+' | 'H-'
    y: 'L+' | 'L-' | 'W+' | 'W-' | 'H+' | 'H-'
    z: 'L+' | 'L-' | 'W+' | 'W-' | 'H+' | 'H-'
  }
  orientationLabel?: string
  weight: number
  color: string
  canRotate: boolean
  stackable: boolean
  maxStackLayers?: number
  groundOnly?: boolean
  /**
   * Manual-only marker: box remains in `placed` for visibility, but statistics
   * (placedCount/usedVolume/labelStats/layers) exclude it.
   */
  blockingInvalid?: boolean
  /** Vertical stacking depth. A box on the floor is layer 1 (PRD 9.3). */
  physicalLayer: number
  /** Loading wave along the container depth axis, once finalization assigns it. */
  depthLayer?: number
  workStep: number
  supportType: 'floor' | 'fully-supported' | 'partially-supported'
  supportedBy: string[]
}

/** Completed placement returned in a PackingResult. */
export type PlacedBox = PlacementBox & {
  /** Finite positive loading wave derived from final coordinates. */
  depthLayer: number
}

export type UnplacedCargo = {
  cargoId: string
  name: string
  label: string
  quantity: number
  /** English fallback reason text retained for backwards compatibility. */
  reason: string
  /** Structured reason code used for localized rendering. */
  reasonCode: string
}

export type LayerLabelCount = {
  label: string
  color: string
  count: number
}

export type PackingLayer = {
  id: string
  physicalLayer: number
  minZ: number
  maxZ: number
  count: number
  weight: number
  volume: number
  labels: LayerLabelCount[]
  supportedBy: string[]
}

export type LoadingStep = {
  step: number
  boxId: string
  cargoId: string
  label: string
  physicalLayer: number
  supportType: PlacedBox['supportType']
}

export type LabelPackingStats = {
  label: string
  name: string
  color: string
  planned: number
  placed: number
  unplaced: number
  layers: number[]
}

type PackingDiagnosticDetails = {
  id: string
  severity: 'info' | 'warning' | 'error'
  message: string
  /** Optional structured code used for localized rendering (e.g., unplaced reason). */
  code?: string
  /** Optional parameters that vary the rendered message (e.g., label, name, quantity). */
  params?: Record<string, string | number>
}

export type PackingDiagnostic = PackingDiagnosticDetails & (
  | { source: 'manual'; sourceIssueId: string }
  | { source?: never; sourceIssueId?: never }
)

export type LoadingMode = 'volume' | 'weight' | 'quantity' | 'input'

export type PackingResult = {
  placed: PlacedBox[]
  unplaced: UnplacedCargo[]
  layers: PackingLayer[]
  workSteps: LoadingStep[]
  labelStats: LabelPackingStats[]
  diagnostics: PackingDiagnostic[]
  totalCargoCount: number
  placedCount: number
  usedVolume: number
  containerVolume: number
  volumeUtilization: number
  usedWeight: number
  weightUtilization: number
}

export type Locale = 'en' | 'zh'

export type ImportTemplateUnits = {
  length: 'auto' | 'mm' | 'cm'
  width: 'auto' | 'mm' | 'cm'
  height: 'auto' | 'mm' | 'cm'
}

export type ImportTemplateDefaults = {
  label?: string
  name?: string
  quantity?: number
  weight?: number
  color?: string
  canRotate?: boolean
  stackable?: boolean
  maxStackLayers?: number
  groundOnly?: boolean
}

export interface ImportTemplate {
  id: string
  name: string
  mapping: Record<string, string>
  units: ImportTemplateUnits
  headerRow: number
  startRow: number
  mergeRows: 'none' | 'by-label'
  dimensionMode: 'separate' | 'combined'
  combinedColumn?: string
  dimensionOrder: Array<'length' | 'width' | 'height'>
  defaultValues: ImportTemplateDefaults
  createdAt: string
  updatedAt: string
}

export type ExportColumnUnit = 'mm' | 'cm'

export type ExportTemplateColumn = {
  field: string
  header: string
  unit?: ExportColumnUnit
}

export interface ExportTemplate {
  id: string
  name: string
  columns: ExportTemplateColumn[]
  createdAt?: string
  updatedAt?: string
}
