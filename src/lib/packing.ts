import type { CargoItem, ContainerSpec, LoadingMode, PackingDiagnostic, PackingResult, PlacedBox, UnplacedCargo } from '../types'
import { effectiveContainer, getContainerVolume } from '../data/containers'
import { assignDepthLayers, buildPackingLayers } from './layers'
import { stackCapacity, violatesStackChain, type StackChainNode } from './stackCapacity'
import { generateBlockCandidates, type BlockCandidate } from './blocks'
import { initEMS, splitEMS, type EmptyMaximalSpace } from './emsSpace'
import { GAP_FILL_SOURCE } from './placementSource'

export const UNPLACED_REASON_CODES = {
  EXCEEDS_DIMENSIONS: 'exceeds-dimensions',
  EXCEEDS_PAYLOAD: 'exceeds-payload',
  NO_SPACE: 'no-space',
} as const

export type UnplacedReasonCode = (typeof UNPLACED_REASON_CODES)[keyof typeof UNPLACED_REASON_CODES]

const UNPLACED_REASON_MESSAGES: Record<UnplacedReasonCode, string> = {
  [UNPLACED_REASON_CODES.EXCEEDS_DIMENSIONS]: 'Exceeds container dimensions',
  [UNPLACED_REASON_CODES.EXCEEDS_PAYLOAD]: 'Exceeds maximum payload',
  [UNPLACED_REASON_CODES.NO_SPACE]: 'No remaining loading space',
}

type BoxSize = {
  length: number
  width: number
  height: number
}

type StackLimitCarrier = {
  stackable: boolean
  maxStackLayers?: number
  groundOnly?: boolean
}

export type CalculatePackingOptions = {
  loadingMode?: LoadingMode
  defaultMaxStackLayers?: number
}

type OrientationKey = PlacedBox['orientationKey']
type LabelRotationDeg = PlacedBox['labelRotationDeg']
type CargoPackingState = {
  item: CargoItem
  itemIndex: number
  label: string
  remaining: number
  nextIndex: number
  catalog: BlockCandidate[]
}

type BlockPlacementChoice = {
  state: CargoPackingState
  block: BlockCandidate
  ems: EmptyMaximalSpace
  point: PackingPoint
  waste: number
}

export type BoxOrientation = BoxSize & {
  orientationKey: OrientationKey
  labelRotationDeg: LabelRotationDeg
}

export type PackingPoint = {
  x: number
  y: number
  z: number
}

const EPSILON = 0.001
const MAX_BLOCK_CATALOG_SIZE = 120
const MAX_BLOCK_REJECTIONS_PER_STEP = 40

function labelForIndex(index: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let value = index
  let label = ''
  do {
    label = alphabet[value % alphabet.length] + label
    value = Math.floor(value / alphabet.length) - 1
  } while (value >= 0)
  return label
}

function labelForCargoItem(item: CargoItem, itemIndex: number) {
  const rawLabel = String(item.label || labelForIndex(itemIndex)).trim()
  return rawLabel.length <= 2 ? rawLabel.toUpperCase() : rawLabel
}

function labelRotationForOrientation(orientationKey: OrientationKey): LabelRotationDeg {
  const rotations: Record<OrientationKey, LabelRotationDeg> = {
    LWH: 0,
    WLH: 90,
    LHW: 90,
    HLW: 180,
    WHL: 270,
    HWL: 180,
  }
  return rotations[orientationKey]
}

function makeOrientation(length: number, width: number, height: number, orientationKey: OrientationKey): BoxOrientation {
  return {
    length,
    width,
    height,
    orientationKey,
    labelRotationDeg: labelRotationForOrientation(orientationKey),
  }
}

export function orientations(item: CargoItem): BoxOrientation[] {
  const base = makeOrientation(item.length, item.width, item.height, 'LWH')
  if (!item.canRotate) {
    return [base]
  }

  const options = [
    base,
    makeOrientation(item.width, item.length, item.height, 'WLH'),
    makeOrientation(item.length, item.height, item.width, 'LHW'),
    makeOrientation(item.height, item.length, item.width, 'HLW'),
    makeOrientation(item.width, item.height, item.length, 'WHL'),
    makeOrientation(item.height, item.width, item.length, 'HWL'),
  ]

  return options.filter(
    (option, index, list) =>
      list.findIndex(
        (other) =>
          other.length === option.length &&
          other.width === option.width &&
          other.height === option.height,
      ) === index,
  )
}

function fitsInsideContainer(point: PackingPoint, box: BoxSize, container: ContainerSpec) {
  return (
    point.x + box.length <= container.length + EPSILON &&
    point.y + box.width <= container.width + EPSILON &&
    point.z + box.height <= container.height + EPSILON
  )
}

function overlaps(a: PlacedBox, point: PackingPoint, box: BoxSize) {
  return !(
    point.x + box.length <= a.x + EPSILON ||
    a.x + a.length <= point.x + EPSILON ||
    point.y + box.width <= a.y + EPSILON ||
    a.y + a.width <= point.y + EPSILON ||
    point.z + box.height <= a.z + EPSILON ||
    a.z + a.height <= point.z + EPSILON
  )
}

function supportOverlap(candidate: PlacedBox, point: PackingPoint, box: BoxSize) {
  if (Math.abs(candidate.z + candidate.height - point.z) > EPSILON) {
    return 0
  }

  const overlapX = Math.max(
    0,
    Math.min(point.x + box.length, candidate.x + candidate.length) - Math.max(point.x, candidate.x),
  )
  const overlapY = Math.max(
    0,
    Math.min(point.y + box.width, candidate.y + candidate.width) - Math.max(point.y, candidate.y),
  )
  return overlapX * overlapY
}

function supportDetails(point: PackingPoint, box: BoxSize, placed: PlacedBox[]) {
  if (point.z <= EPSILON) {
    return {
      supportedArea: box.length * box.width,
      supportRatio: 1,
      supportedBy: [] as PlacedBox[],
      supportType: 'floor' as const,
      physicalLayer: 1,
    }
  }

  const baseArea = box.length * box.width
  const supportedBy = placed.filter((candidate) => supportOverlap(candidate, point, box) > 0)
  const supportedArea = supportedBy.reduce((area, candidate) => area + supportOverlap(candidate, point, box), 0)
  const supportRatio = baseArea ? supportedArea / baseArea : 0

  return {
    supportedArea,
    supportRatio,
    supportedBy,
    supportType: supportRatio >= 1 - EPSILON ? ('fully-supported' as const) : ('partially-supported' as const),
    physicalLayer: Math.max(...supportedBy.map((candidate) => candidate.physicalLayer), 0) + 1,
  }
}

function respectsMaxStackLayers(
  support: ReturnType<typeof supportDetails>,
  placedById: Map<string, StackChainNode>,
  item: StackLimitCarrier,
) {
  if (item.groundOnly && support.physicalLayer > 1) return false

  const stack: StackChainNode[] = [...support.supportedBy]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current.id)) continue
    visited.add(current.id)

    if (current.groundOnly && current.physicalLayer > 1) return false
    if (support.physicalLayer - current.physicalLayer + 1 > stackCapacity(current)) return false

    stack.push(
      ...current.supportedBy
        .map((supportId) => placedById.get(supportId))
        .filter((supportBox): supportBox is StackChainNode => Boolean(supportBox)),
    )
  }

  return true
}

function preservesReservedTopPassengerStackSlot(
  support: ReturnType<typeof supportDetails>,
  placedById: Map<string, StackChainNode>,
) {
  const stack: StackChainNode[] = [...support.supportedBy]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current.id)) continue
    visited.add(current.id)

    const capacity = stackCapacity(current)
    if (Number.isFinite(capacity) && support.physicalLayer - current.physicalLayer + 1 >= capacity) {
      return false
    }

    stack.push(
      ...current.supportedBy
        .map((supportId) => placedById.get(supportId))
        .filter((supportBox): supportBox is StackChainNode => Boolean(supportBox)),
    )
  }

  return true
}

function canPlace(
  point: PackingPoint,
  box: BoxSize,
  container: ContainerSpec,
  placed: PlacedBox[],
  placedById: Map<string, StackChainNode>,
  item: StackLimitCarrier,
  reservedTopPassengerHeight = 0,
  reserveTopPassengerStackSlot = false,
) {
  if (!fitsInsideContainer(point, box, container)) return false
  if (reservedTopPassengerHeight > 0 && stackCapacity(item) > 1 && point.z + box.height + reservedTopPassengerHeight > container.height + EPSILON) return false
  if (!placed.every((candidate) => !overlaps(candidate, point, box))) return false

  const support = supportDetails(point, box, placed)
  if (reserveTopPassengerStackSlot && !preservesReservedTopPassengerStackSlot(support, placedById)) return false
  return support.supportRatio >= 0.5 && respectsMaxStackLayers(support, placedById, item)
}

function pointKey(point: PackingPoint) {
  return `${Math.round(point.x)}:${Math.round(point.y)}:${Math.round(point.z)}`
}

function normalizePoints(points: PackingPoint[], container: ContainerSpec) {
  const seen = new Set<string>()
  return points
    .filter((point) => (
      point.x >= 0 &&
      point.y >= 0 &&
      point.z >= 0 &&
      point.x <= container.length &&
      point.y <= container.width &&
      point.z <= container.height
    ))
    .filter((point) => {
      const key = pointKey(point)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)
}

export function placementScore(
  item: CargoItem,
  box: BoxOrientation,
  point: PackingPoint,
  placed: PlacedBox[],
  container: ContainerSpec,
  committedOrientation?: OrientationKey,
) {
  // Discourage tilting (orientations where original height is no longer along z),
  // so realistic upright placement wins when both orientations fit comparably.
  const tiltPenalty = box.height === item.height ? 0 : container.length * container.width * container.height

  // Same-cargo orientation commitment: once a cargo's first upright box fixes an orientation,
  // keep the rest of that cargo in it so floor rows share a pitch instead of alternating
  // LWH/WLH and leaving side gaps. Strong penalty, not a hard filter — it dominates local
  // position tiebreakers but yields when the committed orientation cannot fit anywhere, so a
  // box switches orientation rather than going unplaced. Only constrains upright candidates;
  // tilts stay governed by tiltPenalty.
  const orientationCommitmentPenalty =
    committedOrientation !== undefined && box.orientationKey !== committedOrientation && box.height === item.height
      ? container.length * container.width * container.height * 0.5
      : 0

  // Prefer LWH orientation (original length along container length) so cargo labels
  // face the inspection door. Cancels the -box.width * 0.01 tiebreaker advantage
  // WLH naturally gets (since box.width = item.length ≥ item.width = LWH width).
  const labelFacingPenalty = box.orientationKey !== 'LWH' && box.height === item.height
    ? (item.length - item.width) * 0.01
    : 0

  // Edge-snap bonuses: prefer placements that snap to container or neighbor boundaries.
  let snapBonus = 0
  if (Math.abs(point.y + box.width - container.width) <= EPSILON) {
    snapBonus -= container.width * container.height
  }
  if (Math.abs(point.x + box.length - container.length) <= EPSILON) {
    snapBonus -= container.height
  }
  for (const candidate of placed) {
    if (
      Math.abs(point.y + box.width - candidate.y) <= EPSILON &&
      Math.abs(point.x - candidate.x) <= EPSILON &&
      Math.abs(point.z - candidate.z) <= EPSILON
    ) {
      snapBonus -= container.height
    }
    if (
      Math.abs(candidate.y + candidate.width - point.y) <= EPSILON &&
      Math.abs(candidate.x - point.x) <= EPSILON &&
      Math.abs(candidate.z - point.z) <= EPSILON
    ) {
      snapBonus -= container.height
    }
  }

  const topPassengerFloorPenalty = stackCapacity(item) === 1 && point.z <= EPSILON
    ? container.length * container.width * container.height
    : 0

  const capacity = stackCapacity(item)
  // Same-label adjacency bonus: prefer placing cargo near existing boxes
  // with the same label, so same-product groups stay together in the container.
  let sameLabelBonus = 0
  for (const candidate of placed) {
    if (candidate.cargoId === item.id) {
      // Check if placed adjacent (touching on floor plane) or stacked on top
      const touchesX = Math.abs(point.x - candidate.x) <= EPSILON && Math.abs(point.y + box.width - candidate.y) <= EPSILON
      const touchesY = Math.abs(candidate.y + candidate.width - point.y) <= EPSILON && Math.abs(point.x - candidate.x) <= EPSILON
      const stackedOn = point.z > EPSILON && Math.abs(point.z - candidate.z - candidate.height) <= EPSILON &&
        point.x <= candidate.x + candidate.length + EPSILON && point.x + box.length >= candidate.x - EPSILON &&
        point.y <= candidate.y + candidate.width + EPSILON && point.y + box.width >= candidate.y - EPSILON
      if (touchesX || touchesY || stackedOn) {
        sameLabelBonus -= container.height
      }
    }
  }

  // Same-height stacking bonus: prefer stacking boxes of the same height
  // on top of each other, reducing the visual gaps from mixed-height layers.
  let sameHeightBonus = 0
  for (const candidate of placed) {
    if (Math.abs(candidate.height - box.height) <= EPSILON && point.z > EPSILON &&
      Math.abs(point.z - candidate.z - candidate.height) <= EPSILON) {
      // Supporting box has same height as the placed box
      sameHeightBonus -= container.height / 1000
    }
  }

  if (Number.isFinite(capacity)) {
    const limitedCapacityFloorPenalty = placed.length > 0 && point.z <= EPSILON
      ? container.length * container.width * container.height
      : 0
    return (
      tiltPenalty +
      orientationCommitmentPenalty +
      labelFacingPenalty +
      sameLabelBonus +
      sameHeightBonus +
      topPassengerFloorPenalty +
      limitedCapacityFloorPenalty +
      (container.height - point.z) * container.length * container.width +
      point.x * container.width +
      point.y +
      snapBonus -
      box.width * 0.01
    )
  }

  // Primary ordering: prefer placements deeper into the container (low x), then closer
  // to the side (low y), then lower (low z). Tiebreakers prefer taller and wider boxes
  // so that pinwheel arrangements emerge naturally for tightly packed pallet loads.
  return (
    tiltPenalty +
    orientationCommitmentPenalty +
    labelFacingPenalty +
    sameLabelBonus +
    sameHeightBonus +
    topPassengerFloorPenalty +
    point.x * container.width * container.height +
    point.y * container.height +
    point.z +
    (container.height - box.height) / 100000 +
    snapBonus -
    box.width * 0.01
  )
}

function bestPlacement(
  item: CargoItem,
  container: ContainerSpec,
  placed: PlacedBox[],
  points: PackingPoint[],
  reservedTopPassengerHeight = 0,
  preferCapacityOneTopPassenger = false,
  reserveTopPassengerStackSlot = false,
  deferCapacityOneFloorFallback = false,
  committedOrientation?: OrientationKey,
) {
  const placedById = new Map<string, StackChainNode>(placed.map((placedBox) => [placedBox.id, placedBox]))
  const bestFromPoints = (candidatePoints: PackingPoint[]) => orientations(item)
    .filter(
      (option) =>
        option.length <= container.length &&
        option.width <= container.width &&
        option.height <= container.height,
    )
    .flatMap((box) =>
      candidatePoints
        .filter((point) => canPlace(
          point,
          box,
          container,
          placed,
          placedById,
          item,
          reservedTopPassengerHeight,
          reserveTopPassengerStackSlot,
        ))
        .map((point) => ({
          box,
          point,
          score: placementScore(item, box, point, placed, container, committedOrientation),
        })),
    )
    .sort((a, b) => a.score - b.score || b.box.width - a.box.width || b.box.length * b.box.width - a.box.length * a.box.width)[0]

  if (preferCapacityOneTopPassenger && stackCapacity(item) === 1 && !item.groundOnly && placed.length > 0) {
    const topPlacement = bestFromPoints(normalizePoints(topSurfacePoints(placed, item, container.height - item.height), container))
    if (topPlacement) return topPlacement
    if (deferCapacityOneFloorFallback) return undefined
  }

  return bestFromPoints(points)
}

function topSurfacePoints(placed: PlacedBox[], item?: CargoItem, minZ = 0) {
  const levels = new Map<number, { x: Set<number>; y: Set<number> }>()
  const itemOrientations = item ? orientations(item) : []
  const points = new Map<string, PackingPoint>()
  const addPoint = (point: PackingPoint) => {
    points.set(pointKey(point), point)
  }
  for (const box of placed) {
    const z = box.z + box.height
    if (z < minZ - EPSILON) continue
    const level = levels.get(z) ?? { x: new Set<number>(), y: new Set<number>() }
    level.x.add(box.x)
    level.x.add(box.x + box.length)
    level.y.add(box.y)
    level.y.add(box.y + box.width)
    levels.set(z, level)
    for (const orientation of itemOrientations) {
      for (let x = box.x; x + orientation.length <= box.x + box.length + EPSILON; x += orientation.length) {
        for (let y = box.y; y + orientation.width <= box.y + box.width + EPSILON; y += orientation.width) {
          addPoint({ x, y, z })
        }
      }
    }
  }

  const xOffsets = new Set([0])
  const yOffsets = new Set([0])
  if (item) {
    for (const box of itemOrientations) {
      xOffsets.add(-box.length)
      yOffsets.add(-box.width)
    }
  }

  for (const [z, level] of levels.entries()) {
    const xs = [...level.x]
    const ys = [...level.y]
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    for (const box of itemOrientations) {
      for (let x = minX; x + box.length <= maxX + EPSILON; x += box.length) {
        for (let y = minY; y + box.width <= maxY + EPSILON; y += box.width) {
          addPoint({ x, y, z })
        }
      }
    }
    for (const edgeX of level.x) {
      for (const edgeY of level.y) {
        for (const xOffset of xOffsets) {
          for (const yOffset of yOffsets) {
            addPoint({ x: edgeX + xOffset, y: edgeY + yOffset, z })
          }
        }
      }
    }
  }

  return [...points.values()]
}

function minimumFittingHeight(item: CargoItem, container: ContainerSpec) {
  const fittingHeights = orientations(item)
    .filter(
      (box) =>
        box.length <= container.length &&
        box.width <= container.width &&
        box.height <= container.height,
    )
    .map((box) => box.height)
  return fittingHeights.length > 0 ? Math.min(...fittingHeights) : 0
}

function placedBoxesOverlap(a: PlacedBox, b: PlacedBox) {
  return !(
    a.x + a.length <= b.x + EPSILON ||
    b.x + b.length <= a.x + EPSILON ||
    a.y + a.width <= b.y + EPSILON ||
    b.y + b.width <= a.y + EPSILON ||
    a.z + a.height <= b.z + EPSILON ||
    b.z + b.height <= a.z + EPSILON
  )
}

function hasOverlapViolation(placed: PlacedBox[]) {
  return placed.some((box, index) => placed.slice(index + 1).some((other) => placedBoxesOverlap(box, other)))
}

function hasBoundaryViolation(placed: PlacedBox[], container: ContainerSpec) {
  return placed.some(
    (box) =>
      box.x < -EPSILON ||
      box.y < -EPSILON ||
      box.z < -EPSILON ||
      box.x + box.length > container.length + EPSILON ||
      box.y + box.width > container.width + EPSILON ||
      box.z + box.height > container.height + EPSILON,
  )
}

function hasStackingViolation(placed: PlacedBox[]) {
  const placedById = new Map(placed.map((box) => [box.id, box]))
  return placed.some((box) => violatesStackChain(box, placedById) !== null)
}

function loadingSequenceScore(box: PlacedBox, container: ContainerSpec) {
  return (
    box.x * container.width * container.height +
    box.y * container.height +
    box.z
  )
}

function assignWorkStepsByDepth(placed: PlacedBox[], container: ContainerSpec) {
  const ordered = [...placed].sort(
    (a, b) =>
      loadingSequenceScore(a, container) - loadingSequenceScore(b, container) ||
      a.index - b.index ||
      a.id.localeCompare(b.id),
  )

  ordered.forEach((box, index) => {
    box.workStep = index + 1
  })
}

function buildDiagnostics(
  placed: PlacedBox[],
  unplaced: PackingResult['unplaced'],
  container: ContainerSpec,
  usedWeight: number,
  volumeUtilization: number,
  cargoById: Map<string, CargoItem>,
): PackingDiagnostic[] {
  const diagnostics: PackingDiagnostic[] = []
  const boundaryViolation = hasBoundaryViolation(placed, container)
  const weightViolation = usedWeight > container.maxWeight + EPSILON
  const overlapViolation = hasOverlapViolation(placed)
  const partialSupport = placed.some((box) => box.supportType === 'partially-supported')
  const missingSupport = placed.some((box) => box.z > EPSILON && box.supportedBy.length === 0)
  const stackingViolation = hasStackingViolation(placed)

  diagnostics.push({
    id: 'boundary-check',
    severity: boundaryViolation ? 'error' : 'info',
    message: boundaryViolation
      ? 'Boundary check failed: at least one placed box exceeds the effective container.'
      : 'Boundary check passed: all placed boxes are inside the effective container.',
  })

  diagnostics.push({
    id: 'weight-check',
    severity: weightViolation ? 'error' : 'info',
    message: weightViolation
      ? 'Weight check failed: placed cargo exceeds the maximum payload.'
      : 'Weight check passed: placed cargo is within the maximum payload.',
  })

  diagnostics.push({
    id: 'overlap-check',
    severity: overlapViolation ? 'error' : 'info',
    message: overlapViolation
      ? 'Overlap check failed: at least one pair of placed boxes overlaps.'
      : 'Overlap check passed: placed boxes do not overlap.',
  })

  diagnostics.push({
    id: 'support-check',
    severity: missingSupport ? 'error' : partialSupport ? 'warning' : 'info',
    message: missingSupport
      ? 'Support check failed: stacked cargo is missing explicit support.'
      : partialSupport
        ? 'Support check warning: some boxes are only partially supported.'
        : 'Support check passed: stacked boxes have explicit support relationships.',
  })

  diagnostics.push({
    id: 'stacking-check',
    severity: stackingViolation ? 'error' : 'info',
    message: stackingViolation
      ? 'Stacking check failed: at least one support chain exceeds stack capacity or ground-only limits.'
      : 'Stacking check passed: stack capacity and ground-only limits are respected.',
  })

  unplaced.forEach((item) => {
    diagnostics.push({
      id: `unplaced-${item.cargoId}`,
      severity: 'warning',
      code: item.reasonCode,
      params: {
        label: item.label,
        name: item.name,
        quantity: item.quantity,
        reasonCode: item.reasonCode,
      },
      message: `${item.label} ${item.name}: ${item.quantity} unplaced because ${item.reason}.`,
    })
  })

  const totalUnplacedQuantity = unplaced.reduce((sum, item) => sum + item.quantity, 0)
  const noSpaceUnplaced = unplaced.filter((item) => item.reasonCode === UNPLACED_REASON_CODES.NO_SPACE)
  const noSpaceQuantity = noSpaceUnplaced.reduce((sum, item) => sum + item.quantity, 0)
  const lowCapacityNoSpaceQuantity = noSpaceUnplaced.reduce((sum, item) => {
    const cargo = cargoById.get(item.cargoId)
    return cargo && stackCapacity(cargo) <= 1 ? sum + item.quantity : sum
  }, 0)

  if (
    totalUnplacedQuantity > 0 &&
    noSpaceQuantity === totalUnplacedQuantity &&
    lowCapacityNoSpaceQuantity / totalUnplacedQuantity >= 0.5 &&
    usedWeight <= container.maxWeight + EPSILON
  ) {
    diagnostics.push({
      id: 'stack-capacity-limit',
      severity: 'warning',
      message: 'stack capacity limit: unplaced cargo is mainly constrained by too many non-stackable or capacity-1 boxes after floor and top positions are exhausted. 堆叠容量提示：未放置货物主要受不可堆叠/容量 1 货物过多限制，地面与可用顶面位置已耗尽。',
    })
  }

  diagnostics.push({
    id: 'optimization-suggestion',
    severity: unplaced.length > 0 || volumeUtilization < 70 ? 'warning' : 'info',
    message: unplaced.length > 0
      ? 'Optimization suggestion: review unplaced cargo, container size, reserved gaps, weight limit, or stackability rules.'
      : volumeUtilization < 70
        ? 'Optimization suggestion: utilization is below 70%; consider a smaller container or revised cargo grouping.'
        : 'Optimization suggestion: current packing has no obvious compliance blockers.',
  })

  return diagnostics
}

function effectiveMaxStackLayers(item: CargoItem, defaultMaxStackLayers: number | undefined) {
  if (item.maxStackLayers !== undefined) return item.maxStackLayers
  return defaultMaxStackLayers
}

function normalizeDefaultMaxStackLayers(value: number | undefined) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return undefined
  return Math.floor(Number(value))
}

function cargoVolume(item: CargoItem) {
  return item.length * item.width * item.height
}

function compareBlockCatalog(a: BlockCandidate, b: BlockCandidate, loadingMode: LoadingMode) {
  if (loadingMode === 'quantity') {
    return b.volume - a.volume
      || b.count - a.count
      || b.footprintArea - a.footprintArea
  }
  if (loadingMode === 'weight') {
    return b.weight - a.weight
      || b.volume - a.volume
      || b.count - a.count
  }
  return b.volume - a.volume
    || b.count - a.count
    || b.footprintArea - a.footprintArea
}

function compareBlockChoices(a: BlockPlacementChoice, b: BlockPlacementChoice, loadingMode: LoadingMode) {
  if (loadingMode === 'quantity') {
    return b.block.volume - a.block.volume
      || b.block.count - a.block.count
      || a.waste - b.waste
      || a.point.z - b.point.z
      || a.point.x - b.point.x
      || a.point.y - b.point.y
  }
  return b.block.volume - a.block.volume
    || b.block.count - a.block.count
    || a.waste - b.waste
    || a.point.z - b.point.z
    || a.point.x - b.point.x
    || a.point.y - b.point.y
}

function blockPlacementKey(choice: Pick<BlockPlacementChoice, 'state' | 'block' | 'point'>) {
  const { state, block, point } = choice
  return [
    state.item.id,
    block.orientationKey,
    block.nx,
    block.ny,
    block.nz,
    point.x,
    point.y,
    point.z,
  ].join(':')
}

function blockCandidateKey(block: BlockCandidate) {
  return [
    block.orientationKey,
    block.nx,
    block.ny,
    block.nz,
  ].join(':')
}

function trimBlockCatalog(blocks: BlockCandidate[]) {
  const selected = new Map<string, BlockCandidate>()
  for (const block of blocks.slice(0, MAX_BLOCK_CATALOG_SIZE)) {
    selected.set(blockCandidateKey(block), block)
  }
  for (const block of blocks) {
    if (block.count === 1) selected.set(blockCandidateKey(block), block)
  }
  return [...selected.values()]
}

function emsFitsForBlock(emsList: EmptyMaximalSpace[], block: BlockCandidate) {
  const blockVolume = block.length * block.width * block.height
  return emsList
    .filter((ems) => block.length <= ems.length + EPSILON && block.width <= ems.width + EPSILON && block.height <= ems.height + EPSILON)
    .map((ems) => ({
      ems,
      point: { x: ems.x, y: ems.y, z: ems.z },
      waste: ems.length * ems.width * ems.height - blockVolume,
    }))
    .sort((a, b) => a.waste - b.waste || a.point.z - b.point.z || a.point.x - b.point.x || a.point.y - b.point.y)
}

function loadingPriorityRank(item: Pick<CargoItem, 'loadingPriority'>) {
  return item.loadingPriority === 'first' ? 0 : 1
}

function canUseTopSurfacePoints(item: CargoItem, hasFirstPriorityCargo = false) {
  return !item.groundOnly && (stackCapacity(item) === 1 || (hasFirstPriorityCargo && item.loadingPriority !== 'first'))
}

export function shouldUseBlockEngine(cargoItems: CargoItem[], loadingMode: LoadingMode): boolean {
  const totalCargoCount = cargoItems.reduce((sum, item) => sum + item.quantity, 0)
  return (loadingMode === 'quantity' || loadingMode === 'volume')
    && cargoItems.length >= 2
    && totalCargoCount >= 100
    && !cargoItems.some((item) => (item as CargoItem & { loadingPriority?: string }).loadingPriority === 'first')
    && cargoItems.every((item) => !item.groundOnly && item.stackable && item.maxStackLayers === undefined)
}

export function calculatePacking(container: ContainerSpec, cargoItems: CargoItem[], options: CalculatePackingOptions = {}): PackingResult {
  const effective = effectiveContainer(container)
  const placed: PlacedBox[] = []
  // Each cargo commits to the orientation of its first upright placement; later boxes of the
  // same cargo reuse it so rows share a pitch and stop leaving alternating side gaps.
  const committedOrientations = new Map<string, OrientationKey>()
  let extremePoints: PackingPoint[] = [{ x: 0, y: 0, z: 0 }]
  const unplacedMap = new Map<string, UnplacedCargo>()
  let usedWeight = 0
  let totalCargoCount = 0

  const loadingMode = options.loadingMode ?? 'quantity'
  const defaultMaxStackLayers = normalizeDefaultMaxStackLayers(options.defaultMaxStackLayers)
  const hasFirstPriorityCargo = cargoItems.some((item) => item.loadingPriority === 'first')
  const expanded = cargoItems
    .flatMap((item, itemIndex) => {
      totalCargoCount += item.quantity
      const label = labelForCargoItem(item, itemIndex)
      const effectiveItem = {
        ...item,
        maxStackLayers: effectiveMaxStackLayers(item, defaultMaxStackLayers),
      }
      return Array.from({ length: item.quantity }, (_, index) => ({ item: effectiveItem, itemIndex, label, index: index + 1 }))
    })
    .sort((a, b) => {
      const priority = loadingPriorityRank(a.item) - loadingPriorityRank(b.item)
      if (priority !== 0) return priority
      if (loadingMode === 'input') {
        return a.itemIndex - b.itemIndex || a.index - b.index
      }
      if (loadingMode === 'weight') {
        return b.item.weight - a.item.weight || cargoVolume(b.item) - cargoVolume(a.item)
      }
      if (loadingMode === 'quantity') {
        if (hasFirstPriorityCargo && loadingPriorityRank(a.item) === 1 && loadingPriorityRank(b.item) === 1) {
          return cargoVolume(a.item) - cargoVolume(b.item) || b.item.quantity - a.item.quantity
        }
        return stackCapacity(b.item) - stackCapacity(a.item)
          || b.item.quantity - a.item.quantity
          || cargoVolume(b.item) - cargoVolume(a.item)
      }
      return stackCapacity(b.item) - stackCapacity(a.item)
        || cargoVolume(b.item) - cargoVolume(a.item)
    })
  const minPendingTopPassengerHeights = new Array<number>(expanded.length).fill(Number.POSITIVE_INFINITY)
  let minPendingTopPassengerHeight = Number.POSITIVE_INFINITY
  for (let idx = expanded.length - 1; idx >= 0; idx -= 1) {
    minPendingTopPassengerHeights[idx] = minPendingTopPassengerHeight
    if (stackCapacity(expanded[idx].item) === 1) {
      const height = minimumFittingHeight(expanded[idx].item, effective)
      if (height > 0) {
        minPendingTopPassengerHeight = Math.min(minPendingTopPassengerHeight, height)
      }
    }
  }

  const cargoStates: CargoPackingState[] = cargoItems.map((item, itemIndex) => {
    const effectiveItem = {
      ...item,
      maxStackLayers: effectiveMaxStackLayers(item, defaultMaxStackLayers),
    }
    const catalog = generateBlockCandidates(effectiveItem, effective)
      .sort((a, b) => compareBlockCatalog(a, b, loadingMode))
    const trimmedCatalog = trimBlockCatalog(catalog)
    return {
      item: effectiveItem,
      itemIndex,
      label: labelForCargoItem(item, itemIndex),
      remaining: item.quantity,
      nextIndex: 1,
      catalog: trimmedCatalog,
    }
  })

  const markUnplaced = (item: CargoItem, label: string, reasonCode: UnplacedReasonCode, quantity = 1) => {
    const current = unplacedMap.get(item.id)
    unplacedMap.set(item.id, {
      cargoId: item.id,
      name: item.name,
      label,
      quantity: (current?.quantity ?? 0) + quantity,
      reasonCode,
      reason: UNPLACED_REASON_MESSAGES[reasonCode],
    })
  }

  const buildPlacedBox = (
    entry: { item: CargoItem; itemIndex: number; label: string; index: number },
    placement: { box: BoxOrientation; point: PackingPoint },
    supportPlaced: PlacedBox[],
    workStep: number,
    placementSource?: string,
  ): PlacedBox => {
    const { box, point } = placement
    const support = supportDetails(point, box, supportPlaced)
    const placedBox = {
      id: `${entry.item.id}-${entry.index}`,
      cargoId: entry.item.id,
      name: entry.item.name,
      label: entry.label,
      index: entry.index,
      x: point.x,
      y: point.y,
      z: point.z,
      length: box.length,
      width: box.width,
      height: box.height,
      orientationKey: box.orientationKey,
      labelRotationDeg: box.labelRotationDeg,
      weight: entry.item.weight,
      color: entry.item.color,
      canRotate: entry.item.canRotate,
      stackable: entry.item.stackable,
      maxStackLayers: entry.item.maxStackLayers,
      groundOnly: entry.item.groundOnly,
      loadingPriority: entry.item.loadingPriority,
      physicalLayer: support.physicalLayer,
      verticalLayer: support.physicalLayer,
      workStep,
      supportType: support.supportType,
      supportedBy: support.supportedBy.map((candidate) => candidate.id),
      verticalSupportedBy: support.supportedBy.map((candidate) => candidate.id),
    }
    if (placementSource) {
      ;(placedBox as PlacedBox & { placementSource?: string }).placementSource = placementSource
    }
    return placedBox
  }

  const placeEntry = (
    entry: { item: CargoItem; itemIndex: number; label: string; index: number },
    placement: { box: BoxOrientation; point: PackingPoint },
    placementSource?: string,
  ) => {
    const { box, point } = placement
    if (box.height === entry.item.height && !committedOrientations.has(entry.item.id)) {
      committedOrientations.set(entry.item.id, box.orientationKey)
    }
    placed.push(buildPlacedBox(entry, placement, placed, placed.length + 1, placementSource))

    extremePoints = normalizePoints(
      [
        ...extremePoints.filter((candidate) => pointKey(candidate) !== pointKey(point)),
        { x: point.x + box.length, y: point.y, z: point.z },
        { x: point.x, y: point.y + box.width, z: point.z },
        { x: point.x, y: point.y, z: point.z + box.height },
      ],
      effective,
    )
    usedWeight += entry.item.weight
  }

  const blockUnitBox = (block: BlockCandidate): BoxOrientation => ({
    length: block.box.length,
    width: block.box.width,
    height: block.box.height,
    orientationKey: block.orientationKey,
    labelRotationDeg: labelRotationForOrientation(block.orientationKey),
  })

  const blockUnitPlacements = (choice: BlockPlacementChoice) => {
    const box = blockUnitBox(choice.block)
    const units: Array<{ entry: { item: CargoItem; itemIndex: number; label: string; index: number }; placement: { box: BoxOrientation; point: PackingPoint } }> = []
    let offset = 0
    for (let zIndex = 0; zIndex < choice.block.nz; zIndex += 1) {
      for (let xIndex = 0; xIndex < choice.block.nx; xIndex += 1) {
        for (let yIndex = 0; yIndex < choice.block.ny; yIndex += 1) {
          units.push({
            entry: {
              item: choice.state.item,
              itemIndex: choice.state.itemIndex,
              label: choice.state.label,
              index: choice.state.nextIndex + offset,
            },
            placement: {
              box,
              point: {
                x: choice.point.x + xIndex * box.length,
                y: choice.point.y + yIndex * box.width,
                z: choice.point.z + zIndex * box.height,
              },
            },
          })
          offset += 1
        }
      }
    }
    return units
  }

  const canStageBlock = (choice: BlockPlacementChoice) => {
    if (usedWeight + choice.block.weight > effective.maxWeight + EPSILON) return false
    const staged = [...placed]
    for (const unit of blockUnitPlacements(choice)) {
      const stagedById = new Map<string, StackChainNode>(staged.map((placedBox) => [placedBox.id, placedBox]))
      if (!canPlace(unit.placement.point, unit.placement.box, effective, staged, stagedById, unit.entry.item)) {
        return false
      }
      staged.push(buildPlacedBox(unit.entry, unit.placement, staged, staged.length + 1))
    }
    return true
  }

  let emsList = initEMS(effective)

  const commitBlock = (choice: BlockPlacementChoice) => {
    const placementSource = choice.block.count === 1 ? GAP_FILL_SOURCE : undefined
    for (const unit of blockUnitPlacements(choice)) {
      placeEntry(unit.entry, unit.placement, placementSource)
      choice.state.remaining -= 1
      choice.state.nextIndex += 1
    }
    emsList = splitEMS(emsList, {
      x: choice.point.x,
      y: choice.point.y,
      z: choice.point.z,
      length: choice.block.length,
      width: choice.block.width,
      height: choice.block.height,
    })
  }

  const selectBlockPlacement = (rejected: Set<string>): BlockPlacementChoice | undefined => {
    for (const priorityRank of [0, 1]) {
      let best: BlockPlacementChoice | undefined
      for (const state of cargoStates) {
        if (state.remaining <= 0 || loadingPriorityRank(state.item) !== priorityRank) continue
        for (const block of state.catalog) {
          if (block.count > state.remaining) continue
          if (usedWeight + block.weight > effective.maxWeight + EPSILON) continue
          for (const fit of emsFitsForBlock(emsList, block)) {
            const choice = { state, block, ems: fit.ems, point: fit.point, waste: fit.waste }
            if (rejected.has(blockPlacementKey(choice))) continue
            if (!best || compareBlockChoices(choice, best, loadingMode) < 0) best = choice
            break
          }
        }
      }
      if (best) return best
    }
    return undefined
  }

  const useBlockEngine = shouldUseBlockEngine(cargoStates.map((state) => state.item), loadingMode)

  if (useBlockEngine) {
    const rejected = new Set<string>()
    let rejectionsSinceCommit = 0
    while (cargoStates.some((state) => state.remaining > 0)) {
      const choice = selectBlockPlacement(rejected)
      if (!choice) break
      if (!canStageBlock(choice)) {
        rejected.add(blockPlacementKey(choice))
        rejectionsSinceCommit += 1
        if (rejectionsSinceCommit >= MAX_BLOCK_REJECTIONS_PER_STEP) break
        continue
      }
      commitBlock(choice)
      rejected.clear()
      rejectionsSinceCommit = 0
    }

    for (const state of cargoStates) {
      while (state.remaining > 0) {
        if (usedWeight + state.item.weight > effective.maxWeight + EPSILON) break
        const placement = bestPlacement(
          state.item,
          effective,
          placed,
          normalizePoints(
            canUseTopSurfacePoints(state.item, hasFirstPriorityCargo)
              ? [...extremePoints, ...topSurfacePoints(placed, state.item)]
              : extremePoints,
            effective,
          ),
          0,
          loadingMode === 'quantity',
          false,
          false,
          committedOrientations.get(state.item.id),
        )
        if (!placement) break
        placeEntry({
          item: state.item,
          itemIndex: state.itemIndex,
          label: state.label,
          index: state.nextIndex,
        }, placement, GAP_FILL_SOURCE)
        state.remaining -= 1
        state.nextIndex += 1
      }
    }

    for (const state of cargoStates) {
      if (state.remaining <= 0) continue
      if (orientations(state.item).every((box) => !fitsInsideContainer({ x: 0, y: 0, z: 0 }, box, effective))) {
        markUnplaced(state.item, state.label, UNPLACED_REASON_CODES.EXCEEDS_DIMENSIONS, state.remaining)
        continue
      }
      if (usedWeight + state.item.weight > effective.maxWeight + EPSILON) {
        markUnplaced(state.item, state.label, UNPLACED_REASON_CODES.EXCEEDS_PAYLOAD, state.remaining)
        continue
      }
      markUnplaced(state.item, state.label, UNPLACED_REASON_CODES.NO_SPACE, state.remaining)
    }
  } else if (loadingMode === 'volume') {
    const remaining = [...expanded]
    while (remaining.length > 0) {
      const placedById = new Map<string, StackChainNode>(placed.map((placedBox) => [placedBox.id, placedBox]))
      let best: { score: number; box: BoxOrientation; point: PackingPoint; idx: number } | undefined

      for (const priorityRank of [0, 1]) {
        if (!remaining.some((entry) => loadingPriorityRank(entry.item) === priorityRank)) continue
        for (let idx = 0; idx < remaining.length; idx += 1) {
          const entry = remaining[idx]
          const item = entry.item
          if (loadingPriorityRank(item) !== priorityRank) continue
          if (orientations(item).every((box) => !fitsInsideContainer({ x: 0, y: 0, z: 0 }, box, effective))) {
            continue
          }
          if (usedWeight + item.weight > effective.maxWeight + EPSILON) {
            continue
          }
          for (const box of orientations(item)) {
            if (box.length > effective.length || box.width > effective.width || box.height > effective.height) {
              continue
            }
            const topPassengerPoints = canUseTopSurfacePoints(item, hasFirstPriorityCargo) && placed.length > 0
              ? normalizePoints(topSurfacePoints(placed, item), effective)
              : []
            const candidatePointSets = topPassengerPoints.length > 0 ? [topPassengerPoints, extremePoints] : [extremePoints]
            for (const candidatePoints of candidatePointSets) {
              for (const point of candidatePoints) {
                if (!canPlace(point, box, effective, placed, placedById, item)) continue
                const score = placementScore(item, box, point, placed, effective, committedOrientations.get(item.id))
                if (
                  best === undefined ||
                  score < best.score ||
                  (score === best.score && box.width > best.box.width)
                ) {
                  best = { score, box, point, idx }
                }
              }
            }
          }
        }
        if (best) break
      }

      if (!best) break
      const choice = best
      const entry = remaining[choice.idx]
      remaining.splice(choice.idx, 1)
      placeEntry(entry, { box: choice.box, point: choice.point })
    }

    for (const entry of remaining) {
      const item = entry.item
      if (orientations(item).every((box) => !fitsInsideContainer({ x: 0, y: 0, z: 0 }, box, effective))) {
        markUnplaced(item, entry.label, UNPLACED_REASON_CODES.EXCEEDS_DIMENSIONS)
        continue
      }
      if (usedWeight + item.weight > effective.maxWeight + EPSILON) {
        markUnplaced(item, entry.label, UNPLACED_REASON_CODES.EXCEEDS_PAYLOAD)
        continue
      }
      markUnplaced(item, entry.label, UNPLACED_REASON_CODES.NO_SPACE)
    }
  } else {
    const noSpaceEntries: typeof expanded = []
    for (let entryIndex = 0; entryIndex < expanded.length; entryIndex += 1) {
      const entry = expanded[entryIndex]
      const item = entry.item

      if (orientations(item).every((box) => !fitsInsideContainer({ x: 0, y: 0, z: 0 }, box, effective))) {
        markUnplaced(item, entry.label, UNPLACED_REASON_CODES.EXCEEDS_DIMENSIONS)
        continue
      }

      if (usedWeight + item.weight > effective.maxWeight) {
        markUnplaced(item, entry.label, UNPLACED_REASON_CODES.EXCEEDS_PAYLOAD)
        continue
      }

      const topPassengerHeight = loadingMode === 'quantity' && stackCapacity(item) > 1
        ? minPendingTopPassengerHeights[entryIndex]
        : Number.POSITIVE_INFINITY
      const reservedTopPassengerHeight = Number.isFinite(topPassengerHeight) ? topPassengerHeight : 0
      const reserveTopPassengerStackSlot = loadingMode === 'quantity' && reservedTopPassengerHeight > 0 && stackCapacity(item) > 1
      const placement = bestPlacement(
        item,
        effective,
        placed,
        normalizePoints(
          canUseTopSurfacePoints(item, hasFirstPriorityCargo)
            ? [...extremePoints, ...topSurfacePoints(placed, item)]
            : extremePoints,
          effective,
        ),
        reservedTopPassengerHeight,
        loadingMode === 'quantity',
        reserveTopPassengerStackSlot,
        loadingMode === 'quantity',
        committedOrientations.get(item.id),
      )
      if (!placement) {
        markUnplaced(item, entry.label, UNPLACED_REASON_CODES.NO_SPACE)
        noSpaceEntries.push(entry)
        continue
      }
      placeEntry(entry, placement)
    }

    const retryEntries = noSpaceEntries.filter((entry) => canUseTopSurfacePoints(entry.item, hasFirstPriorityCargo))
    for (const entry of retryEntries) {
      const placement = bestPlacement(
        entry.item,
        effective,
        placed,
        normalizePoints([...extremePoints, ...topSurfacePoints(placed, entry.item)], effective),
        0,
        false,
        false,
        false,
        committedOrientations.get(entry.item.id),
      )
      if (!placement) continue
      placeEntry(entry, placement)
      const current = unplacedMap.get(entry.item.id)
      if (!current) continue
      if (current.quantity <= 1) {
        unplacedMap.delete(entry.item.id)
      } else {
        unplacedMap.set(entry.item.id, { ...current, quantity: current.quantity - 1 })
      }
    }
  }

  const usedVolume = placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
  const containerVolume = getContainerVolume(container)
  const unplaced = [...unplacedMap.values()]
  const volumeUtilization = containerVolume ? (usedVolume / containerVolume) * 100 : 0
  const weightUtilization = effective.maxWeight ? (usedWeight / effective.maxWeight) * 100 : 0

  // 1. Generate compliance diagnostics under original Z-gravity physical support relations
  const diagnostics = buildDiagnostics(
    placed,
    unplaced,
    effective,
    usedWeight,
    volumeUtilization,
    new Map(cargoItems.map((item) => [item.id, {
      ...item,
      maxStackLayers: effectiveMaxStackLayers(item, defaultMaxStackLayers),
    }])),
  )

  // 2. Perform inward physical layer mapping and pusher updates (depth layers)
  assignDepthLayers(placed)
  assignWorkStepsByDepth(placed, effective)
  const layers = buildPackingLayers(placed)

  const labelStats = cargoItems.map((item, itemIndex) => {
    const label = labelForCargoItem(item, itemIndex)
    const placedBoxes = placed.filter((box) => box.cargoId === item.id)
    const unplacedQuantity = unplaced.find((entry) => entry.cargoId === item.id)?.quantity ?? 0
    return {
      label,
      name: item.name,
      color: item.color,
      planned: item.quantity,
      placed: placedBoxes.length,
      unplaced: unplacedQuantity,
      layers: [...new Set(placedBoxes.map((box) => box.physicalLayer))].sort((a, b) => a - b),
    }
  })

  return {
    placed,
    unplaced,
    layers,
    workSteps: placed.map((box) => ({
      step: box.workStep,
      boxId: box.id,
      cargoId: box.cargoId,
      label: box.label,
      physicalLayer: box.physicalLayer,
      supportType: box.supportType,
    })),
    labelStats,
    diagnostics,
    totalCargoCount,
    placedCount: placed.length,
    usedVolume,
    containerVolume,
    volumeUtilization,
    usedWeight,
    weightUtilization,
  }
}
