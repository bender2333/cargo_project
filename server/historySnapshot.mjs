export const HISTORY_SNAPSHOT_MAX_BYTES = 2_500_000

const ORIENTATION_KEYS = ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL']
const LABEL_ROTATIONS = [0, 90, 180, 270]
const SUPPORT_TYPES = ['floor', 'fully-supported', 'partially-supported']
const DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error']
const SIGNED_AXES = ['L+', 'L-', 'W+', 'W-', 'H+', 'H-']

function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`)
  return value
}

function array(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`)
  return value
}

function string(value, path) {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`)
  return value
}

function boolean(value, path) {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`)
  return value
}

function finite(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`)
  return value
}

function nonNegative(value, path) {
  const parsed = finite(value, path)
  if (parsed < 0) throw new Error(`${path} must be non-negative`)
  return parsed
}

function positive(value, path) {
  const parsed = finite(value, path)
  if (parsed <= 0) throw new Error(`${path} must be positive`)
  return parsed
}

function integer(value, path, minimum = 0) {
  const parsed = finite(value, path)
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${path} must be an integer >= ${minimum}`)
  return parsed
}

function enumeration(value, allowed, path) {
  if (!allowed.includes(value)) throw new Error(`${path} has an illegal value`)
  return value
}

function validateContainer(value, path) {
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

function validateCargoItems(value, path) {
  const items = array(value, path)
  const ids = new Set()
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

function validateManualDraft(value, cargoIds, path) {
  const draft = record(value, path)
  const boxes = new Map()
  array(draft.boxes, `${path}.boxes`).forEach((value, index) => {
    const boxPath = `${path}.boxes[${index}]`
    const box = record(value, boxPath)
    const id = string(box.id, `${boxPath}.id`)
    if (boxes.has(id)) throw new Error(`${boxPath}.id must be unique`)
    const cargoId = string(box.cargoId, `${boxPath}.cargoId`)
    if (!cargoIds.has(cargoId)) throw new Error(`${boxPath}.cargoId references missing cargo`)
    string(box.label, `${boxPath}.label`)
    string(box.color, `${boxPath}.color`)
    for (const field of ['baseLength', 'baseWidth', 'baseHeight']) {
      if (box[field] !== undefined) positive(box[field], `${boxPath}.${field}`)
    }
    nonNegative(box.x, `${boxPath}.x`)
    nonNegative(box.y, `${boxPath}.y`)
    nonNegative(box.z, `${boxPath}.z`)
    positive(box.length, `${boxPath}.length`)
    positive(box.width, `${boxPath}.width`)
    positive(box.height, `${boxPath}.height`)
    enumeration(box.orientationKey, ORIENTATION_KEYS, `${boxPath}.orientationKey`)
    enumeration(box.labelRotationDeg, LABEL_ROTATIONS, `${boxPath}.labelRotationDeg`)
    if (box.yawQuarterTurn !== undefined) enumeration(box.yawQuarterTurn, [0, 1, 2, 3], `${boxPath}.yawQuarterTurn`)
    if (box.pitchQuarterTurn !== undefined) enumeration(box.pitchQuarterTurn, [0, 1, 2, 3], `${boxPath}.pitchQuarterTurn`)
    if (box.orientationAxes !== undefined) {
      const axes = record(box.orientationAxes, `${boxPath}.orientationAxes`)
      enumeration(axes.x, SIGNED_AXES, `${boxPath}.orientationAxes.x`)
      enumeration(axes.y, SIGNED_AXES, `${boxPath}.orientationAxes.y`)
      enumeration(axes.z, SIGNED_AXES, `${boxPath}.orientationAxes.z`)
    }
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

function validateManualPlanConsistency(manualBoxes, placedBoxes) {
  if (manualBoxes.size !== placedBoxes.size) throw new Error('history.manualDraft and packingResult.placed must have the same box IDs/count')
  const fields = ['cargoId', 'label', 'color', 'x', 'y', 'z', 'length', 'width', 'height', 'orientationKey', 'labelRotationDeg']
  const poseFields = ['yawQuarterTurn', 'pitchQuarterTurn', 'orientationLabel']
  for (const [id, manual] of manualBoxes) {
    const placed = placedBoxes.get(id)?.value
    if (!placed) throw new Error('history.manualDraft and packingResult.placed must have the same box IDs/count')
    for (const field of fields) {
      if (manual[field] !== placed[field]) throw new Error(`history.manualDraft ${id}.${field} must match packingResult.placed`)
    }
    for (const field of poseFields) {
      if (manual[field] !== undefined && manual[field] !== placed[field]) {
        throw new Error(`history.manualDraft ${id}.${field} must match packingResult.placed`)
      }
    }
    if (manual.orientationAxes !== undefined) {
      const placedAxes = placed.orientationAxes
      if (!placedAxes || ['x', 'y', 'z'].some((axis) => manual.orientationAxes[axis] !== placedAxes[axis])) {
        throw new Error(`history.manualDraft ${id}.orientationAxes must match packingResult.placed`)
      }
    }
  }
}

function validatePackingResult(value, cargoIds, path, container, placementMode) {
  const result = record(value, path)
  const placed = array(result.placed, `${path}.placed`)
  const unplaced = array(result.unplaced, `${path}.unplaced`)
  const layers = array(result.layers, `${path}.layers`)
  const workSteps = array(result.workSteps, `${path}.workSteps`)
  const labelStats = array(result.labelStats, `${path}.labelStats`)
  const diagnostics = array(result.diagnostics, `${path}.diagnostics`)
  const boxes = new Map()
  const diagnosticIds = new Set()
  const placedLayerCounts = new Map()
  const layerPhysicalLayers = new Set()
  const effectiveLength = Math.max(0, container.length - container.doorGap)
  const effectiveWidth = Math.max(0, container.width - container.sideGap * 2)
  const effectiveHeight = Math.max(0, container.height - container.topGap)

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
    if (x + length > effectiveLength || y + width > effectiveWidth || z + height > effectiveHeight) {
      throw new Error(`${boxPath} must fit inside the effective container`)
    }
    enumeration(box.orientationKey, ORIENTATION_KEYS, `${boxPath}.orientationKey`)
    enumeration(box.labelRotationDeg, LABEL_ROTATIONS, `${boxPath}.labelRotationDeg`)
    if (box.yawQuarterTurn !== undefined) enumeration(box.yawQuarterTurn, [0, 1, 2, 3], `${boxPath}.yawQuarterTurn`)
    if (box.pitchQuarterTurn !== undefined) enumeration(box.pitchQuarterTurn, [0, 1, 2, 3], `${boxPath}.pitchQuarterTurn`)
    if (box.orientationAxes !== undefined) {
      const axes = record(box.orientationAxes, `${boxPath}.orientationAxes`)
      enumeration(axes.x, SIGNED_AXES, `${boxPath}.orientationAxes.x`)
      enumeration(axes.y, SIGNED_AXES, `${boxPath}.orientationAxes.y`)
      enumeration(axes.z, SIGNED_AXES, `${boxPath}.orientationAxes.z`)
    }
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
    placedLayerCounts.set(physicalLayer, (placedLayerCounts.get(physicalLayer) ?? 0) + 1)
    boxes.set(id, { cargoId, workStep, physicalLayer, supportType, supportedBy, value: box })
  })

  unplaced.forEach((value, index) => {
    const itemPath = `${path}.unplaced[${index}]`
    const item = record(value, itemPath)
    const cargoId = string(item.cargoId, `${itemPath}.cargoId`)
    if (!cargoIds.has(cargoId)) throw new Error(`${itemPath}.cargoId references missing cargo`)
    string(item.name, `${itemPath}.name`)
    string(item.label, `${itemPath}.label`)
    integer(item.quantity, `${itemPath}.quantity`, 1)
    string(item.reason, `${itemPath}.reason`)
    string(item.reasonCode, `${itemPath}.reasonCode`)
  })

  layers.forEach((value, index) => {
    const layerPath = `${path}.layers[${index}]`
    const layer = record(value, layerPath)
    string(layer.id, `${layerPath}.id`)
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
  const stepBoxes = new Set()
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

  labelStats.forEach((value, index) => {
    const statPath = `${path}.labelStats[${index}]`
    const stat = record(value, statPath)
    string(stat.label, `${statPath}.label`)
    string(stat.name, `${statPath}.name`)
    string(stat.color, `${statPath}.color`)
    integer(stat.planned, `${statPath}.planned`)
    integer(stat.placed, `${statPath}.placed`)
    integer(stat.unplaced, `${statPath}.unplaced`)
    array(stat.layers, `${statPath}.layers`).forEach((layer, layerIndex) => integer(layer, `${statPath}.layers[${layerIndex}]`, 1))
  })
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
      enumeration(diagnostic.source, ['manual'], `${diagnosticPath}.source`)
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
  if (placedCount !== placed.length) throw new Error(`${path}.placedCount must match placed.length`)
  nonNegative(result.usedVolume, `${path}.usedVolume`)
  positive(result.containerVolume, `${path}.containerVolume`)
  nonNegative(result.volumeUtilization, `${path}.volumeUtilization`)
  nonNegative(result.usedWeight, `${path}.usedWeight`)
  nonNegative(result.weightUtilization, `${path}.weightUtilization`)
  return { totalCargoCount, placedCount, layerCount: layers.length, boxes }
}

export function assertValidHistoryPlanData(data) {
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
  const plannedCargoCount = snapshot.cargoItems.reduce((total, item) => total + item.quantity, 0)

  if (snapshot.schemaVersion === undefined) {
    for (const field of ['packingResult', 'manualDraft', 'placementMode', 'draftInitialized']) {
      if (field in snapshot) throw new Error(`Legacy history cannot contain v2-only field ${field}`)
    }
    if (totalCargoCount !== plannedCargoCount) throw new Error('Legacy history totalCargoCount must match cargo quantities')
    if (placedCount > totalCargoCount) throw new Error('Legacy history placedCount cannot exceed totalCargoCount')
    return
  }
  if (snapshot.schemaVersion !== 2) throw new Error(`Unsupported history snapshot version: ${String(snapshot.schemaVersion)}`)
  const placementMode = enumeration(snapshot.placementMode, ['auto', 'manual'], 'history.placementMode')
  const result = validatePackingResult(snapshot.packingResult, cargoIds, 'history.packingResult', container, placementMode)
  if (placedCount !== result.placedCount) throw new Error('history.placedCount must match packingResult.placedCount')
  if (totalCargoCount !== result.totalCargoCount) throw new Error('history.totalCargoCount must match packingResult.totalCargoCount')
  if (totalCargoCount !== plannedCargoCount) throw new Error('history.totalCargoCount must match planned cargo quantities')
  if (result.placedCount > totalCargoCount) throw new Error('history.placedCount cannot exceed totalCargoCount')
  if (layerCount !== result.layerCount) throw new Error('history.layerCount must match packingResult.layers.length')
  if (placementMode === 'manual' && snapshot.manualDraft === undefined) throw new Error('history.manualDraft is required in manual mode')
  if (snapshot.manualDraft !== undefined) {
    const manualBoxes = validateManualDraft(snapshot.manualDraft, cargoIds, 'history.manualDraft')
    if (placementMode === 'manual') validateManualPlanConsistency(manualBoxes, result.boxes)
  }
  if (snapshot.draftInitialized !== undefined) boolean(snapshot.draftInitialized, 'history.draftInitialized')
}

export function historyPlanDataValidationError(data) {
  try {
    assertValidHistoryPlanData(data)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
