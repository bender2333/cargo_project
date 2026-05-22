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
}

export type PlacedBox = {
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
  weight: number
  color: string
  stackable: boolean
  physicalLayer: number
  workStep: number
  supportType: 'floor' | 'fully-supported' | 'partially-supported'
  supportedBy: string[]
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

export type PackingDiagnostic = {
  id: string
  severity: 'info' | 'warning' | 'error'
  message: string
  /** Optional structured code used for localized rendering (e.g., unplaced reason). */
  code?: string
  /** Optional parameters that vary the rendered message (e.g., label, name, quantity). */
  params?: Record<string, string | number>
}

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

export interface CustomDbContainer {
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

export interface DbHistoryPlan {
  id: string
  created_at: string
  project_name: string
  shipment_name: string | null
  loading_mode: LoadingMode
  data: {
    containerId: string
    container: ContainerSpec
    cargoItems: CargoItem[]
    placedCount: number
    totalCargoCount: number
    layerCount: number
    labelSummary: string
  }
}
