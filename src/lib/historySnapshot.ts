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

const ORIENTATION_KEYS = ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL'] as const
const LABEL_ROTATIONS = [0, 90, 180, 270] as const
const SUPPORT_TYPES = ['floor', 'fully-supported', 'partially-supported'] as const
const DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error'] as const
const SIGNED_AXES = ['L+', 'L-', 'W+', 'W-', 'H+', 'H-'] as const

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value as Record<string, unknown>
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`)
  return value
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`)
  return value
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`)
  return value
}

function nonNegative(value: unknown, path: string): number {
  const parsed = finite(value, path)
  if (parsed < 0) throw new Error(`${path} must be non-negative`)
  return parsed
}

function positive(value: unknown, path: string): number {
  const parsed = finite(value, path)
  if (parsed <= 0) throw new Error(`${path} must be positive`)
  return parsed
}

function integer(value: unknown, path: string, minimum = 0): number {
  const parsed = finite(value, path)
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${path} must be an integer >= ${minimum}`)
  return parsed
}

function enumeration<T extends readonly unknown[]>(value: unknown, allowed: T, path: string): T[number] {
  if (!allowed.includes(value)) throw new Error(`${path} has an illegal value`)
  return value as T[number]
}

function validateOrientationAxes(value: unknown, path: string): Record<string, unknown> {
  const axes = record(value, path)
  const x = enumeration(axes.x, SIGNED_AXES, `${path}.x`)
  const y = enumeration(axes.y, SIGNED_AXES, `${path}.y`)
  const z = enumeration(axes.z, SIGNED_AXES, `${path}.z`)
  if (new Set([x[0], y[0], z[0]]).size !== 3) throw new Error(`${path} must use each body axis exactly once`)
  return axes
}

function validateContainer(value: unknown, path: string) {
  const item = record(value, path)
  string(item.id, `${path}.id`)
  string(item.label, `${path}.label`)
  string(item.description, `${path}.description`)
  positive(item.length, `${path}.length`)
  positive(item.width, `${path}.width`)
  positive(item.height, `${path}.height`)
  positive(item.maxWeight, `${path}.maxWeight`)
  nonNegative(item.doorGap, `${path}.doorGap`)
  nonNegative(item.topGap, `${path}.topGap`)
  nonNegative(item.sideGap, `${path}.sideGap`)
}

function validateCargoItems(value: unknown, path: string) {
  const items = array(value, path)
  const ids = new Set<string>()
  items.forEach((value, index) => {
    const itemPath = `${path}[${index}]`
    const item = record(value, itemPath)
    const id = string(item.id, `${itemPath}.id`)
    if (ids.has(id)) throw new Error(`${itemPath}.id must be unique`)
    ids.add(id)
    string(item.name, `${itemPath}.name`)
    if (item.label !== undefined) string(item.label, `${itemPath}.label`)
    positive(item.length, `${itemPath}.length`)
    positive(item.width, `${itemPath}.width`)
    positive(item.height, `${itemPath}.height`)
    nonNegative(item.weight, `${itemPath}.weight`)
    integer(item.quantity, `${itemPath}.quantity`, 1)
    string(item.color, `${itemPath}.color`)
    boolean(item.canRotate, `${itemPath}.canRotate`)
    boolean(item.stackable, `${itemPath}.stackable`)
    if (item.maxStackLayers !== undefined) integer(item.maxStackLayers, `${itemPath}.maxStackLayers`, 1)
    if (item.groundOnly !== undefined) boolean(item.groundOnly, `${itemPath}.groundOnly`)
  })
  return ids
}

function validateManualDraft(value: unknown, cargoIds: Set<string>, path: string, cargoDimensions: ReadonlyMap<string, { length: number; width: number; height: number }>) {
  const draft = record(value, path)
  const boxes = new Map<string, Record<string, unknown>>()
  array(draft.boxes, `${path}.boxes`).forEach((value, index) => {
    const boxPath = `${path}.boxes[${index}]`
    const box = record(value, boxPath)
    const id = string(box.id, `${boxPath}.id`)
    if (boxes.has(id)) throw new Error(`${boxPath}.id must be unique`)
    const cargoId = string(box.cargoId, `${boxPath}.cargoId`)
    if (!cargoIds.has(cargoId)) throw new Error(`${boxPath}.cargoId references missing cargo`)
    string(box.label, `${boxPath}.label`)
    string(box.color, `${boxPath}.color`)
    for (const field of ['baseLength', 'baseWidth', 'baseHeight'] as const) {
      if (box[field] !== undefined) positive(box[field], `${boxPath}.${field}`)
    }
    const cargoDimensionsForBox = cargoDimensions.get(cargoId)
    if (cargoDimensionsForBox) {
      const baseDimensions: Array<['baseLength' | 'baseWidth' | 'baseHeight', number]> = [
        ['baseLength', cargoDimensionsForBox.length],
        ['baseWidth', cargoDimensionsForBox.width],
        ['baseHeight', cargoDimensionsForBox.height],
      ]
      for (const [field, expected] of baseDimensions) {
        if (box[field] !== undefined && box[field] !== expected) throw new Error(`${boxPath}.${field} must match cargo dimensions`)
      }
    }
    nonNegative(box.x, `${boxPath}.x`)
    nonNegative(box.y, `${boxPath}.y`)
    nonNegative(box.z, `${boxPath}.z`)
    positive(box.length, `${boxPath}.length`)
    positive(box.width, `${boxPath}.width`)
    positive(box.height, `${boxPath}.height`)
    enumeration(box.orientationKey, ORIENTATION_KEYS, `${boxPath}.orientationKey`)
    enumeration(box.labelRotationDeg, LABEL_ROTATIONS, `${boxPath}.labelRotationDeg`)
    if (box.yawQuarterTurn !== undefined) enumeration(box.yawQuarterTurn, [0, 1, 2, 3] as const, `${boxPath}.yawQuarterTurn`)
    if (box.pitchQuarterTurn !== undefined) enumeration(box.pitchQuarterTurn, [0, 1, 2, 3] as const, `${boxPath}.pitchQuarterTurn`)
    if (box.orientationAxes !== undefined) validateOrientationAxes(box.orientationAxes, `${boxPath}.orientationAxes`)
    if (box.orientationLabel !== undefined) string(box.orientationLabel, `${boxPath}.orientationLabel`)
    if (box.weight !== undefined) nonNegative(box.weight, `${boxPath}.weight`)
    if (box.canRotate !== undefined) boolean(box.canRotate, `${boxPath}.canRotate`)
    if (box.stackable !== undefined) boolean(box.stackable, `${boxPath}.stackable`)
    if (box.maxStackLayers !== undefined) integer(box.maxStackLayers, `${boxPath}.maxStackLayers`, 1)
    if (box.groundOnly !== undefined) boolean(box.groundOnly, `${boxPath}.groundOnly`)
    boxes.set(id, box)
  })
  return boxes
}

function validateManualPlanConsistency(
  manualBoxes: Map<string, Record<string, unknown>>,
  placedBoxes: Map<string, { value: Record<string, unknown> }>,
) {
  if (manualBoxes.size !== placedBoxes.size) throw new Error('history.manualDraft and packingResult.placed must have the same box IDs/count')
  const fields = ['cargoId', 'label', 'color', 'x', 'y', 'z', 'length', 'width', 'height', 'orientationKey', 'labelRotationDeg'] as const
  const poseFields = ['yawQuarterTurn', 'pitchQuarterTurn', 'orientationLabel'] as const
  for (const [id, manual] of manualBoxes) {
    const placed = placedBoxes.get(id)?.value
    if (!placed) throw new Error('history.manualDraft and packingResult.placed must have the same box IDs/count')
    for (const field of fields) {
      if (manual[field] !== placed[field]) throw new Error(`history.manualDraft ${id}.${field} must match packingResult.placed`)
    }
    for (const field of poseFields) {
      if (manual[field] !== placed[field]) {
        throw new Error(`history.manualDraft ${id}.${field} must match packingResult.placed`)
      }
    }
    const manualAxes = manual.orientationAxes as Record<string, unknown> | undefined
    const placedAxes = placed.orientationAxes as Record<string, unknown> | undefined
    if (
      Boolean(manualAxes) !== Boolean(placedAxes)
      || (manualAxes && placedAxes && ['x', 'y', 'z'].some((axis) => manualAxes[axis] !== placedAxes[axis]))
    ) {
      throw new Error(`history.manualDraft ${id}.orientationAxes must match packingResult.placed`)
    }
  }
}

function validatePackingResult(value: unknown, cargoIds: Set<string>, path: string, container: Record<string, unknown>, placementMode: 'auto' | 'manual', cargoItems: ReadonlyArray<CargoItem>) {
  const result = record(value, path)
  const cargoQuantities = new Map(cargoItems.map((item) => [item.id, item.quantity]))
  const placed = array(result.placed, `${path}.placed`)
  const unplaced = array(result.unplaced, `${path}.unplaced`)
  const layers = array(result.layers, `${path}.layers`)
  const workSteps = array(result.workSteps, `${path}.workSteps`)
  const labelStats = array(result.labelStats, `${path}.labelStats`)
  const diagnostics = array(result.diagnostics, `${path}.diagnostics`)
  const boxes = new Map<string, { cargoId: string; workStep: number; physicalLayer: number; supportType: typeof SUPPORT_TYPES[number]; supportedBy: string[]; value: Record<string, unknown> }>()
  const diagnosticIds = new Set<string>()
  const placedCargoCounts = new Map<string, number>()
  const placedCargoLayers = new Map<string, Set<number>>()
  const unplacedCargoCounts = new Map<string, number>()
  const placedLayerCounts = new Map<number, number>()
  const layerPhysicalLayers = new Set<number>()
  const layerIds = new Set<string>()
  const effectiveLength = Math.max(0, (container.length as number) - (container.doorGap as number))
  const effectiveWidth = Math.max(0, (container.width as number) - (container.sideGap as number) * 2)
  const effectiveHeight = Math.max(0, (container.height as number) - (container.topGap as number))

  placed.forEach((value, index) => {
    const boxPath = `${path}.placed[${index}]`
    const box = record(value, boxPath)
    const id = string(box.id, `${boxPath}.id`)
    if (boxes.has(id)) throw new Error(`${boxPath}.id must be unique`)
    const cargoId = string(box.cargoId, `${boxPath}.cargoId`)
    if (!cargoIds.has(cargoId)) throw new Error(`${boxPath}.cargoId references missing cargo`)
    string(box.name, `${boxPath}.name`)
    string(box.label, `${boxPath}.label`)
    integer(box.index, `${boxPath}.index`, 1)
    const x = nonNegative(box.x, `${boxPath}.x`)
    const y = nonNegative(box.y, `${boxPath}.y`)
    const z = nonNegative(box.z, `${boxPath}.z`)
    const length = positive(box.length, `${boxPath}.length`)
    const width = positive(box.width, `${boxPath}.width`)
    const height = positive(box.height, `${boxPath}.height`)
    if (box.blockingInvalid !== undefined) boolean(box.blockingInvalid, `${boxPath}.blockingInvalid`)
    const blockingInvalid = box.blockingInvalid === true
    if (!blockingInvalid && (x + length > effectiveLength || y + width > effectiveWidth || z + height > effectiveHeight)) {
      throw new Error(`${boxPath} must fit inside the effective container`)
    }
    enumeration(box.orientationKey, ORIENTATION_KEYS, `${boxPath}.orientationKey`)
    enumeration(box.labelRotationDeg, LABEL_ROTATIONS, `${boxPath}.labelRotationDeg`)
    if (box.yawQuarterTurn !== undefined) enumeration(box.yawQuarterTurn, [0, 1, 2, 3] as const, `${boxPath}.yawQuarterTurn`)
    if (box.pitchQuarterTurn !== undefined) enumeration(box.pitchQuarterTurn, [0, 1, 2, 3] as const, `${boxPath}.pitchQuarterTurn`)
    if (box.orientationAxes !== undefined) validateOrientationAxes(box.orientationAxes, `${boxPath}.orientationAxes`)
    if (box.orientationLabel !== undefined) string(box.orientationLabel, `${boxPath}.orientationLabel`)
    nonNegative(box.weight, `${boxPath}.weight`)
    string(box.color, `${boxPath}.color`)
    boolean(box.canRotate, `${boxPath}.canRotate`)
    boolean(box.stackable, `${boxPath}.stackable`)
    if (box.maxStackLayers !== undefined) integer(box.maxStackLayers, `${boxPath}.maxStackLayers`, 1)
    if (box.groundOnly !== undefined) boolean(box.groundOnly, `${boxPath}.groundOnly`)
    const physicalLayer = integer(box.physicalLayer, `${boxPath}.physicalLayer`, 1)
    integer(box.depthLayer, `${boxPath}.depthLayer`, 1)
    const workStep = integer(box.workStep, `${boxPath}.workStep`, 1)
    const supportType = enumeration(box.supportType, SUPPORT_TYPES, `${boxPath}.supportType`)
    const supportedBy = array(box.supportedBy, `${boxPath}.supportedBy`).map((id, supporterIndex) => string(id, `${boxPath}.supportedBy[${supporterIndex}]`))
    if (!blockingInvalid) {
      placedCargoCounts.set(cargoId, (placedCargoCounts.get(cargoId) ?? 0) + 1)
      const cargoLayers = placedCargoLayers.get(cargoId) ?? new Set<number>()
      cargoLayers.add(physicalLayer)
      placedCargoLayers.set(cargoId, cargoLayers)
      placedLayerCounts.set(physicalLayer, (placedLayerCounts.get(physicalLayer) ?? 0) + 1)
    }
    boxes.set(id, { cargoId, workStep, physicalLayer, supportType, supportedBy, value: box })
  })
  unplaced.forEach((value, index) => {
    const itemPath = `${path}.unplaced[${index}]`
    const item = record(value, itemPath)
    const cargoId = string(item.cargoId, `${itemPath}.cargoId`)
    if (!cargoIds.has(cargoId)) throw new Error(`${itemPath}.cargoId references missing cargo`)
    if (unplacedCargoCounts.has(cargoId)) throw new Error(`${itemPath}.cargoId must be unique`)
    const quantity = integer(item.quantity, `${itemPath}.quantity`, 1)
    unplacedCargoCounts.set(cargoId, quantity)
    string(item.name, `${itemPath}.name`)
    string(item.label, `${itemPath}.label`)
    string(item.reason, `${itemPath}.reason`)
    string(item.reasonCode, `${itemPath}.reasonCode`)
  })

  for (const [cargoId, plannedQuantity] of cargoQuantities) {
    const accountedQuantity = (placedCargoCounts.get(cargoId) ?? 0) + (unplacedCargoCounts.get(cargoId) ?? 0)
    if (accountedQuantity !== plannedQuantity) {
      throw new Error(`${path} cargo ${cargoId} placed and unplaced quantities must match planned quantity`)
    }
  }
  const expectedLabelStats = new Map<string, { label: string; name: string; color: string; planned: number; placed: number; unplaced: number; layers: number[] }>()
  cargoItems.forEach((item, index) => {
    const label = String(item.label ?? '').trim() || item.name || `Cargo ${index + 1}`
    const key = label.toUpperCase() || `__unnamed_${item.id}`
    const placedCount = placedCargoCounts.get(item.id) ?? 0
    const layers = [...(placedCargoLayers.get(item.id) ?? [])].sort((a, b) => a - b)
    const current = expectedLabelStats.get(key)
    if (current) {
      current.planned += item.quantity
      current.placed += placedCount
      current.unplaced += item.quantity - placedCount
      current.layers = [...new Set([...current.layers, ...layers])].sort((a, b) => a - b)
    } else {
      expectedLabelStats.set(key, {
        label,
        name: item.name,
        color: item.color,
        planned: item.quantity,
        placed: placedCount,
        unplaced: item.quantity - placedCount,
        layers,
      })
    }
  })

  layers.forEach((value, index) => {
    const layerPath = `${path}.layers[${index}]`
    const layer = record(value, layerPath)
    const id = string(layer.id, `${layerPath}.id`)
    if (layerIds.has(id)) throw new Error(`${layerPath}.id must be unique`)
    layerIds.add(id)
    const physicalLayer = integer(layer.physicalLayer, `${layerPath}.physicalLayer`, 1)
    if (layerPhysicalLayers.has(physicalLayer)) throw new Error(`${layerPath}.physicalLayer must be unique`)
    layerPhysicalLayers.add(physicalLayer)
    nonNegative(layer.minZ, `${layerPath}.minZ`)
    nonNegative(layer.maxZ, `${layerPath}.maxZ`)
    const count = integer(layer.count, `${layerPath}.count`)
    if (count !== (placedLayerCounts.get(physicalLayer) ?? 0)) throw new Error(`${layerPath}.count must match placed boxes`)
    nonNegative(layer.weight, `${layerPath}.weight`)
    nonNegative(layer.volume, `${layerPath}.volume`)
    array(layer.labels, `${layerPath}.labels`).forEach((value, labelIndex) => {
      const labelPath = `${layerPath}.labels[${labelIndex}]`
      const label = record(value, labelPath)
      string(label.label, `${labelPath}.label`)
      string(label.color, `${labelPath}.color`)
      integer(label.count, `${labelPath}.count`)
    })
    array(layer.supportedBy, `${layerPath}.supportedBy`).forEach((id, supporterIndex) => {
      const supporterId = string(id, `${layerPath}.supportedBy[${supporterIndex}]`)
      if (!boxes.has(supporterId)) throw new Error(`${layerPath}.supportedBy references missing box`)
    })
  })
  if (layerPhysicalLayers.size !== placedLayerCounts.size) throw new Error(`${path}.layers must cover every placed physical layer`)
  for (const physicalLayer of placedLayerCounts.keys()) {
    if (!layerPhysicalLayers.has(physicalLayer)) throw new Error(`${path}.layers must cover physical layer ${physicalLayer}`)
  }

  for (const [boxId, box] of boxes) {
    for (const supporterId of box.supportedBy) {
      if (!boxes.has(supporterId)) throw new Error(`${path}.placed ${boxId} supportedBy references missing box`)
    }
  }
  if (workSteps.length !== placed.length) throw new Error(`${path}.workSteps must contain one step per placed box`)
  const stepBoxes = new Set<string>()
  workSteps.forEach((value, index) => {
    const stepPath = `${path}.workSteps[${index}]`
    const step = record(value, stepPath)
    if (integer(step.step, `${stepPath}.step`, 1) !== index + 1) throw new Error(`${path}.workSteps must be consecutive in array order`)
    const boxId = string(step.boxId, `${stepPath}.boxId`)
    if (stepBoxes.has(boxId)) throw new Error(`${path}.workSteps boxId must be unique`)
    stepBoxes.add(boxId)
    const box = boxes.get(boxId)
    if (!box) throw new Error(`${stepPath}.boxId references missing box`)
    const cargoId = string(step.cargoId, `${stepPath}.cargoId`)
    if (cargoId !== box.cargoId) throw new Error(`${stepPath}.cargoId does not match its box`)
    if (box.workStep !== step.step) throw new Error(`${path}.placed workStep does not match workSteps`)
    if (step.label !== box.value.label) throw new Error(`${stepPath}.label does not match its box`)
    const physicalLayer = integer(step.physicalLayer, `${stepPath}.physicalLayer`, 1)
    if (physicalLayer !== box.physicalLayer) throw new Error(`${stepPath}.physicalLayer does not match its box`)
    const supportType = enumeration(step.supportType, SUPPORT_TYPES, `${stepPath}.supportType`)
    if (supportType !== box.supportType) throw new Error(`${stepPath}.supportType does not match its box`)
  })
  if (stepBoxes.size !== boxes.size) throw new Error(`${path}.workSteps must reference every placed box`)
  for (const [boxId, box] of boxes) {
    for (const supporterId of box.supportedBy) {
      const supporter = boxes.get(supporterId)
      if (!supporter) throw new Error(`${path}.placed ${boxId} supportedBy references missing box`)
      if (supporter.workStep >= box.workStep) throw new Error(`${path}.placed ${boxId} supporter must precede dependent`)
    }
  }

  const seenLabelKeys = new Set<string>()
  labelStats.forEach((value, index) => {
    const statPath = `${path}.labelStats[${index}]`
    const stat = record(value, statPath)
    const label = string(stat.label, `${statPath}.label`)
    const name = string(stat.name, `${statPath}.name`)
    const color = string(stat.color, `${statPath}.color`)
    const planned = integer(stat.planned, `${statPath}.planned`)
    const placed = integer(stat.placed, `${statPath}.placed`)
    const unplaced = integer(stat.unplaced, `${statPath}.unplaced`)
    const statLayers = array(stat.layers, `${statPath}.layers`).map((layer, layerIndex) => integer(layer, `${statPath}.layers[${layerIndex}]`, 1))
    const key = label.trim().toUpperCase()
    const expected = expectedLabelStats.get(key)
    if (!expected || seenLabelKeys.has(key)) throw new Error(`${statPath} must match cargo-derived label statistics`)
    seenLabelKeys.add(key)
    if (
      label !== expected.label
      || name !== expected.name
      || color !== expected.color
      || planned !== expected.planned
      || placed !== expected.placed
      || unplaced !== expected.unplaced
      || statLayers.length !== expected.layers.length
      || statLayers.some((layer, layerIndex) => layer !== expected.layers[layerIndex])
    ) {
      throw new Error(`${statPath} must match cargo-derived label statistics`)
    }
  })
  if (seenLabelKeys.size !== expectedLabelStats.size) throw new Error(`${path}.labelStats must cover every cargo-derived label`)
  diagnostics.forEach((value, index) => {
    const diagnosticPath = `${path}.diagnostics[${index}]`
    const diagnostic = record(value, diagnosticPath)
    const id = string(diagnostic.id, `${diagnosticPath}.id`)
    if (diagnosticIds.has(id)) throw new Error(`${diagnosticPath}.id must be unique`)
    diagnosticIds.add(id)
    enumeration(diagnostic.severity, DIAGNOSTIC_SEVERITIES, `${diagnosticPath}.severity`)
    string(diagnostic.message, `${diagnosticPath}.message`)
    if (diagnostic.code !== undefined) string(diagnostic.code, `${diagnosticPath}.code`)
    const hasSource = diagnostic.source !== undefined
    const hasSourceIssueId = diagnostic.sourceIssueId !== undefined
    if (hasSource !== hasSourceIssueId) throw new Error(`${diagnosticPath}.source and sourceIssueId must be provided together`)
    if (hasSource) {
      enumeration(diagnostic.source, ['manual'] as const, `${diagnosticPath}.source`)
      string(diagnostic.sourceIssueId, `${diagnosticPath}.sourceIssueId`)
      if (placementMode === 'auto') throw new Error(`${diagnosticPath} manual provenance is not allowed in auto mode`)
    }
    if (diagnostic.params !== undefined) {
      Object.entries(record(diagnostic.params, `${diagnosticPath}.params`)).forEach(([key, param]) => {
        if (typeof param === 'number') finite(param, `${diagnosticPath}.params.${key}`)
        else string(param, `${diagnosticPath}.params.${key}`)
      })
    }
  })

  const totalCargoCount = integer(result.totalCargoCount, `${path}.totalCargoCount`)
  const placedCount = integer(result.placedCount, `${path}.placedCount`)
  const countedPlaced = placed.filter((value) => {
    const box = record(value, `${path}.placed`)
    return box.blockingInvalid !== true
  }).length
  if (placedCount !== countedPlaced) throw new Error(`${path}.placedCount must match non-blocking placed boxes`)
  nonNegative(result.usedVolume, `${path}.usedVolume`)
  positive(result.containerVolume, `${path}.containerVolume`)
  nonNegative(result.volumeUtilization, `${path}.volumeUtilization`)
  nonNegative(result.usedWeight, `${path}.usedWeight`)
  nonNegative(result.weightUtilization, `${path}.weightUtilization`)
  return { totalCargoCount, placedCount, layerCount: layers.length, boxes }
}

export function assertValidHistoryPlanData(data: unknown): asserts data is HistoryPlanData {
  const snapshot = record(data, 'history')
  validateContainer(snapshot.container, 'history.container')
  const cargoIds = validateCargoItems(snapshot.cargoItems, 'history.cargoItems')
  const container = record(snapshot.container, 'history.container')
  if (string(snapshot.containerId, 'history.containerId') !== container.id) throw new Error('history.containerId must match history.container.id')
  const placedCount = integer(snapshot.placedCount, 'history.placedCount')
  const totalCargoCount = integer(snapshot.totalCargoCount, 'history.totalCargoCount')
  const layerCount = integer(snapshot.layerCount, 'history.layerCount')
  string(snapshot.labelSummary, 'history.labelSummary')
  if (snapshot.defaultMaxStackLayers !== undefined) integer(snapshot.defaultMaxStackLayers, 'history.defaultMaxStackLayers', 1)
  const plannedCargoCount = (snapshot.cargoItems as CargoItem[]).reduce((total, item) => total + item.quantity, 0)
  const cargoItems = snapshot.cargoItems as CargoItem[]
  const cargoDimensions = new Map(cargoItems.map((item) => [item.id, { length: item.length, width: item.width, height: item.height }]))
  if (snapshot.schemaVersion === undefined) {
    for (const field of ['packingResult', 'manualDraft', 'placementMode', 'draftInitialized']) {
      if (field in snapshot) throw new Error(`Legacy history cannot contain v2-only field ${field}`)
    }
    if (totalCargoCount !== plannedCargoCount) throw new Error('Legacy history totalCargoCount must match cargo quantities')
    if (placedCount > totalCargoCount) throw new Error('Legacy history placedCount cannot exceed totalCargoCount')
    return
  }

  if (snapshot.schemaVersion !== HISTORY_SNAPSHOT_VERSION) throw new Error(`Unsupported history snapshot version: ${String(snapshot.schemaVersion)}`)
  const placementMode = enumeration(snapshot.placementMode, ['auto', 'manual'] as const, 'history.placementMode')
  const result = validatePackingResult(snapshot.packingResult, cargoIds, 'history.packingResult', container, placementMode, cargoItems)
  if (placedCount !== result.placedCount) throw new Error('history.placedCount must match packingResult.placedCount')
  if (totalCargoCount !== result.totalCargoCount) throw new Error('history.totalCargoCount must match packingResult.totalCargoCount')
  if (layerCount !== result.layerCount) throw new Error('history.layerCount must match packingResult.layers.length')
  if (totalCargoCount !== plannedCargoCount) throw new Error('history.totalCargoCount must match planned cargo quantities')
  if (result.placedCount > totalCargoCount) throw new Error('history.placedCount cannot exceed totalCargoCount')
  if (placementMode === 'manual' && snapshot.manualDraft === undefined) throw new Error('history.manualDraft is required in manual mode')
  if (snapshot.manualDraft !== undefined) {
    const manualBoxes = validateManualDraft(snapshot.manualDraft, cargoIds, 'history.manualDraft', cargoDimensions)
    if (placementMode === 'manual') validateManualPlanConsistency(manualBoxes, result.boxes)
  }
  if (snapshot.draftInitialized !== undefined) boolean(snapshot.draftInitialized, 'history.draftInitialized')
}

export function historyPlanDataValidationError(data: unknown): string | null {
  try {
    assertValidHistoryPlanData(data)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export function isHistorySnapshotV2(data: HistoryPlanData | null | undefined): data is HistorySnapshotV2 {
  return Boolean(data && (data as HistorySnapshotV2).schemaVersion === HISTORY_SNAPSHOT_VERSION && !historyPlanDataValidationError(data))
}

export function buildHistorySnapshot(input: BuildHistorySnapshotInput): HistorySnapshotV2 {
  const container = structuredClone(input.container)
  const cargoItems = structuredClone(input.cargoItems)
  const packingResult = structuredClone(input.packingResult)
  const manualDraft = input.placementMode === 'manual' && input.manualDraft
    ? structuredClone(input.manualDraft)
    : undefined
  const snapshot: HistorySnapshotV2 = {
    schemaVersion: HISTORY_SNAPSHOT_VERSION,
    containerId: container.id,
    container,
    cargoItems,
    placedCount: packingResult.placedCount,
    totalCargoCount: packingResult.totalCargoCount,
    layerCount: packingResult.layers.length,
    labelSummary: packingResult.labelStats.map((item) => `${item.label}:${item.placed}/${item.planned}`).join(', '),
    defaultMaxStackLayers: input.defaultMaxStackLayers,
    placementMode: input.placementMode,
    packingResult,
    manualDraft,
    draftInitialized: input.placementMode === 'manual' ? input.draftInitialized : undefined,
  }
  assertValidHistoryPlanData(snapshot)
  return snapshot
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
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { kind: 'invalid', reason: 'Missing history plan data' }
  }
  const snapshot = data as Record<string, unknown>
  const reason = historyPlanDataValidationError(data)
  if (reason) return { kind: 'invalid', reason }
  if (snapshot.schemaVersion === undefined) {
    return { kind: 'legacy-recompute', data: data as LegacyHistoryPlanData }
  }
  return { kind: 'snapshot', data: data as HistorySnapshotV2 }
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
