import type { CargoItem, ContainerSpec, LoadingMode, PackingDiagnostic, PackingResult, PlacementBox, PlacedBox, UnplacedCargo } from '../types'
import { effectiveContainer, getContainerVolume } from '../data/containers'
import { finalizePlacementGeometry } from './finalizePackingResult'
import { stackCapacity, violatesStackChain, type StackChainNode } from './stackCapacity'
import { initEMS, splitEMS } from './emsSpace'
import { generateBlockCandidates, selectBlockCandidate, type PackingBlockChoice } from './packingCandidates'
import {
  MINIMUM_SUPPORT_RATIO,
  isSupportRatioAccepted,
  canPlaceBox as canPlace,
  canStageBlock as canStageBlockOnState,
  fitsInsideContainer,
  supportDetails,
  type BoxSize,
  type PackingPoint,
} from './packingFeasibility'
import { packingQualityOf } from './packingObjective'
import { repairQuantityPackingGap } from './packingGapRepair'
import { DEFAULT_QUANTITY_SEARCH_BUDGET, optimizePacking, type PackingSearchStats } from './packingSearch'
import { clonePackingSearchState, type PackingCargoState, type PackingSearchState } from './packingSearchState'
import { GAP_FILL_SOURCE } from './placementSource'
import { buildLabelStats } from './labels'
import { SpatialGrid, type SpatialAabb } from './spatialGrid'

export { MINIMUM_SUPPORT_RATIO, isSupportRatioAccepted, supportDetails }
export type { BoxSize, PackingPoint }

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

export type CalculatePackingOptions = {
  loadingMode?: LoadingMode
  defaultMaxStackLayers?: number
  /** Shared with manual placement; default 0.5 keeps existing goldens. */
  supportPolicy?: { minSupportRatio: number }
}

type OrientationKey = PlacedBox['orientationKey']
type LabelRotationDeg = PlacedBox['labelRotationDeg']

export type BoxOrientation = BoxSize & {
  orientationKey: OrientationKey
  labelRotationDeg: LabelRotationDeg
}

const EPSILON = 0.001
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

const orientationCache = new Map<string, BoxOrientation[]>()
export function orientations(item: CargoItem): BoxOrientation[] {
  const key = `${item.length}x${item.width}x${item.height}:${item.canRotate ? 1 : 0}`
  const cached = orientationCache.get(key)
  if (cached) return cached
  const base = makeOrientation(item.length, item.width, item.height, 'LWH')
  if (!item.canRotate) {
    orientationCache.set(key, [base])
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

  const unique = options.filter(
    (option, index, list) =>
      list.findIndex(
        (other) =>
          other.length === option.length &&
          other.width === option.width &&
          other.height === option.height,
      ) === index,
  )
  orientationCache.set(key, unique)
  return unique
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
  placed: PlacementBox[],
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

  const topPassengerFloorPenalty = stackCapacity(item) === 1 && point.z <= EPSILON
    ? container.length * container.width * container.height
    : 0

  const capacity = stackCapacity(item)
  // Branch on whether the stack limit is binding in this container, not merely finite.
  // Non-binding values (e.g. user "99") must share the unlimited low-z scoring path.
  const minimumHeight = minimumFittingHeight(item, container)
  const maxPhysicalLayers = minimumHeight > EPSILON
    ? Math.ceil(container.height / minimumHeight)
    : 0
  const capacityIsBinding = Number.isFinite(capacity) && capacity < maxPhysicalLayers
  // One pass over nearby placed boxes for snap / same-label / same-height bonuses.
  let sameLabelBonus = 0
  let sameHeightBonus = 0
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
    if (candidate.cargoId === item.id) {
      const touchesX = Math.abs(point.x - candidate.x) <= EPSILON && Math.abs(point.y + box.width - candidate.y) <= EPSILON
      const touchesY = Math.abs(candidate.y + candidate.width - point.y) <= EPSILON && Math.abs(point.x - candidate.x) <= EPSILON
      const stackedOn = point.z > EPSILON && Math.abs(point.z - candidate.z - candidate.height) <= EPSILON &&
        point.x <= candidate.x + candidate.length + EPSILON && point.x + box.length >= candidate.x - EPSILON &&
        point.y <= candidate.y + candidate.width + EPSILON && point.y + box.width >= candidate.y - EPSILON
      if (touchesX || touchesY || stackedOn) {
        sameLabelBonus -= container.height
      }
    }
    if (Math.abs(candidate.height - box.height) <= EPSILON && point.z > EPSILON &&
      Math.abs(point.z - candidate.z - candidate.height) <= EPSILON) {
      sameHeightBonus -= container.height / 1000
    }
  }

  if (capacityIsBinding) {
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
  placed: PlacementBox[],
  points: PackingPoint[],
  reservedTopPassengerHeight = 0,
  preferCapacityOneTopPassenger = false,
  reserveTopPassengerStackSlot = false,
  deferCapacityOneFloorFallback = false,
  committedOrientation?: OrientationKey,
  minSupportRatio = MINIMUM_SUPPORT_RATIO,
  placedNearby?: (aabb: SpatialAabb) => PlacementBox[],
  placedByIdInput?: Map<string, StackChainNode>,
) {
  const placedById = placedByIdInput ?? new Map<string, StackChainNode>(placed.map((placedBox) => [placedBox.id, placedBox]))
  const nearbyFor = (point: PackingPoint, box: BoxOrientation): PlacementBox[] => {
    if (!placedNearby) return placed
    return placedNearby({
      minX: point.x - EPSILON, minY: point.y - EPSILON, minZ: point.z - EPSILON,
      maxX: point.x + box.length + EPSILON, maxY: point.y + box.width + EPSILON, maxZ: point.z + box.height + EPSILON,
    })
  }
  const itemOrientations = orientations(item).filter(
    (option) =>
      option.length <= container.length &&
      option.width <= container.width &&
      option.height <= container.height,
  )
  const bestFromPoints = (candidatePoints: PackingPoint[]) => {
    let best: { box: BoxOrientation; point: PackingPoint; score: number } | undefined
    for (const box of itemOrientations) {
      for (const point of candidatePoints) {
        const nearby = nearbyFor(point, box)
        if (!canPlace(
          point,
          box,
          container,
          nearby,
          placedById,
          item,
          reservedTopPassengerHeight,
          reserveTopPassengerStackSlot,
          minSupportRatio,
          placedNearby,
        )) continue
        const score = placementScore(item, box, point, nearby, container, committedOrientation)
        if (
          !best ||
          score < best.score ||
          (score === best.score && box.width > best.box.width) ||
          (score === best.score && box.width === best.box.width && box.length * box.width > best.box.length * best.box.width)
        ) {
          best = { box, point, score }
        }
      }
    }
    return best
  }

  if (preferCapacityOneTopPassenger && stackCapacity(item) === 1 && !item.groundOnly && placed.length > 0) {
    const topPlacement = bestFromPoints(normalizePoints(topSurfacePoints(placed, item, container.height - item.height), container))
    if (topPlacement) return topPlacement
    if (deferCapacityOneFloorFallback) return undefined
  }

  return bestFromPoints(points)
}

function topSurfacePoints(placed: PlacementBox[], item?: CargoItem, minZ = 0) {
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

function placedBoxesOverlap(a: PlacementBox, b: PlacementBox) {
  return !(
    a.x + a.length <= b.x + EPSILON ||
    b.x + b.length <= a.x + EPSILON ||
    a.y + a.width <= b.y + EPSILON ||
    b.y + b.width <= a.y + EPSILON ||
    a.z + a.height <= b.z + EPSILON ||
    b.z + b.height <= a.z + EPSILON
  )
}

function hasOverlapViolation(placed: PlacementBox[]) {
  return placed.some((box, index) => placed.slice(index + 1).some((other) => placedBoxesOverlap(box, other)))
}

function hasBoundaryViolation(placed: PlacementBox[], container: ContainerSpec) {
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

function hasStackingViolation(placed: PlacementBox[]) {
  const placedById = new Map(placed.map((box) => [box.id, box]))
  return placed.some((box) => violatesStackChain(box, placedById) !== null)
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

let lastSearchStats: PackingSearchStats | null = null

/**
 * Last `calculatePacking` search stats on this JavaScript thread.
 * Test / benchmark diagnostic seam only. Not concurrency-safe.
 * Not part of `PackingResult` and must not be treated as a production API.
 */
export function lastPackingSearchStats(): PackingSearchStats | null {
  return lastSearchStats
}

function publishSearchStats(stats: PackingSearchStats) {
  lastSearchStats = stats
}

function greedySearchStats(): PackingSearchStats {
  return {
    strategy: 'greedy',
    statesExpanded: 0,
    candidatesEvaluated: 0,
    budgetExceeded: false,
    elapsedMs: 0,
    claim: 'best-found-within-budget',
  }
}

function blockPlacementKey(choice: Pick<PackingBlockChoice, 'state' | 'block' | 'point'>) {
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

function canUseTopSurfacePoints(item: CargoItem) {
  return !item.groundOnly && stackCapacity(item) === 1
}

export function shouldUseBlockEngine(cargoItems: CargoItem[], loadingMode: LoadingMode, container: ContainerSpec): boolean {
  const totalCargoCount = cargoItems.reduce((sum, item) => sum + item.quantity, 0)
  if (
    (loadingMode !== 'quantity' && loadingMode !== 'volume')
    || cargoItems.length < 2
    || totalCargoCount < 100
    || cargoItems.some((item) => !item.stackable)
  ) return false

  // Per-SKU reachable layers. Oversized SKUs are skipped here and marked
  // exceeds-dimensions on the block path; they must not flip the whole load off.
  return cargoItems.every((item) => {
    const fittingHeight = minimumFittingHeight(item, container)
    if (fittingHeight <= EPSILON) return true

    if (item.maxStackLayers === undefined) return true
    if (!Number.isFinite(item.maxStackLayers) || item.maxStackLayers <= 0) return false

    const ownMaxPhysicalLayers = Math.ceil(container.height / fittingHeight)
    return item.maxStackLayers >= ownMaxPhysicalLayers
  })
}

export function calculatePacking(container: ContainerSpec, cargoItems: CargoItem[], options: CalculatePackingOptions = {}): PackingResult {
  lastSearchStats = greedySearchStats()
  const effective = effectiveContainer(container)
  const placed: PlacementBox[] = []
  const placedByIdLive = new Map<string, StackChainNode>()
  // --- Spatial grid for placed-box queries (uniform 3D grid, EPSILON expansion) ---
  const cellSize = (() => {
    if (cargoItems.length === 0) return 100
    const dims = cargoItems.map((item) => Math.max(item.length, item.width, item.height)).sort((a, b) => a - b)
    return Math.max(100, dims[Math.floor(dims.length / 2)])
  })()
  const gridBounds: SpatialAabb = { minX: 0, minY: 0, minZ: 0, maxX: effective.length, maxY: effective.width, maxZ: effective.height }
  const placedGrid = new SpatialGrid<PlacementBox>(gridBounds, cellSize)
  // Hybrid recall: grid insert/query both have fixed overhead. Stay on linear scans until the
  // placed set is large enough, then bulk-load the grid once and use it for subsequent queries.
  const GRID_NEARBY_MIN_PLACED = Number.MAX_SAFE_INTEGER
  let gridReady = false
  const ensureGrid = () => {
    if (gridReady || placed.length < GRID_NEARBY_MIN_PLACED) return
    for (const box of placed) {
      placedGrid.insert(box.id, {
        minX: box.x, minY: box.y, minZ: box.z,
        maxX: box.x + box.length, maxY: box.y + box.width, maxZ: box.z + box.height,
      }, box)
    }
    gridReady = true
  }
  const placedNearby = (aabb: SpatialAabb): PlacementBox[] => {
    if (placed.length < GRID_NEARBY_MIN_PLACED) return placed
    ensureGrid()
    return placedGrid.query(aabb)
  }
  // ------
  const committedOrientations = new Map<string, OrientationKey>()
  let extremePoints: PackingPoint[] = [{ x: 0, y: 0, z: 0 }]
  const unplacedMap = new Map<string, UnplacedCargo>()
  let usedWeight = 0
  let totalCargoCount = 0

  const loadingMode = options.loadingMode ?? 'quantity'
  const minSupportRatio = options.supportPolicy?.minSupportRatio ?? MINIMUM_SUPPORT_RATIO
  const defaultMaxStackLayers = normalizeDefaultMaxStackLayers(options.defaultMaxStackLayers)
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
      if (loadingMode === 'input') {
        return a.itemIndex - b.itemIndex || a.index - b.index
      }
      if (loadingMode === 'weight') {
        return b.item.weight - a.item.weight || cargoVolume(b.item) - cargoVolume(a.item)
      }
      if (loadingMode === 'quantity') {
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

  const cargoStates: PackingCargoState[] = cargoItems.map((item, itemIndex) => {
    const effectiveItem = {
      ...item,
      maxStackLayers: effectiveMaxStackLayers(item, defaultMaxStackLayers),
    }
    return {
      item: effectiveItem,
      itemIndex,
      label: labelForCargoItem(item, itemIndex),
      remaining: item.quantity,
      nextIndex: 1,
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
    supportPlaced: PlacementBox[],
    workStep: number,
    placementSource?: string,
  ): PlacementBox => {
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
      physicalLayer: support.physicalLayer,
      workStep,
      supportType: support.supportType,
      supportedBy: support.supportedBy.map((candidate) => candidate.id),
    }
    if (placementSource) {
      ;(placedBox as PlacementBox & { placementSource?: string }).placementSource = placementSource
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
    // Floor placements skip support query (supportDetails returns immediately at z≈0).
    const nearbySupport = point.z <= EPSILON
      ? []
      : placedNearby({
          minX: point.x - EPSILON, minY: point.y - EPSILON, minZ: point.z - EPSILON,
          maxX: point.x + box.length + EPSILON, maxY: point.y + box.width + EPSILON, maxZ: point.z + box.height + EPSILON,
        })
    placed.push(buildPlacedBox(entry, placement, nearbySupport, placed.length + 1, placementSource))
    const justPlaced = placed[placed.length - 1]
    placedByIdLive.set(justPlaced.id, justPlaced)
    if (gridReady) {
      placedGrid.insert(justPlaced.id, {
        minX: justPlaced.x, minY: justPlaced.y, minZ: justPlaced.z,
        maxX: justPlaced.x + justPlaced.length, maxY: justPlaced.y + justPlaced.width, maxZ: justPlaced.z + justPlaced.height,
      }, justPlaced)
    }

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

  const blockUnitBox = (block: PackingBlockChoice['block']): BoxOrientation => ({
    length: block.box.length,
    width: block.box.width,
    height: block.box.height,
    orientationKey: block.orientationKey,
    labelRotationDeg: labelRotationForOrientation(block.orientationKey),
  })

  const blockUnitPlacements = (choice: PackingBlockChoice) => {
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

  let emsList = initEMS(effective)

  const currentSearchState = (): PackingSearchState => ({
    container: effective,
    cargoStates,
    emsList,
    placed,
    placedById: placedByIdLive,
    usedWeight,
    minSupportRatio,
  })

  const canStageBlock = (choice: PackingBlockChoice) => canStageBlockOnState(currentSearchState(), choice)

  const commitBlock = (choice: PackingBlockChoice) => {
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

  const selectBlockPlacement = (
    rejected: Set<string>,
    accepts: (choice: PackingBlockChoice) => boolean,
  ): PackingBlockChoice | undefined => {
    const searchState = currentSearchState()
    const mode = loadingMode === 'volume' ? 'volume' : 'quantity'
    const candidates = generateBlockCandidates(searchState, mode)
      .filter((choice) => !rejected.has(blockPlacementKey(choice)) && accepts(choice))
    return selectBlockCandidate(candidates, mode, searchState)
  }

  const placeBlocks = (accepts: (choice: PackingBlockChoice) => boolean) => {
    const rejected = new Set<string>()
    let rejectionsSinceCommit = 0
    while (cargoStates.some((state) => state.remaining > 0)) {
      const choice = selectBlockPlacement(rejected, accepts)
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
  }

  const snapshotSearchState = () => clonePackingSearchState(currentSearchState())

  const applySearchState = (state: PackingSearchState) => {
    placed.length = 0
    placed.push(...state.placed)
    placedByIdLive.clear()
    for (const box of placed) placedByIdLive.set(box.id, box)
    for (const [id, node] of state.placedById) {
      if (!placedByIdLive.has(id)) placedByIdLive.set(id, node)
    }
    cargoStates.length = 0
    cargoStates.push(...state.cargoStates)
    emsList = state.emsList
    usedWeight = state.usedWeight
    committedOrientations.clear()
    const ordered = placed.slice().sort((a, b) => a.workStep - b.workStep)
    for (const box of ordered) {
      const item = cargoStates.find((entry) => entry.item.id === box.cargoId)?.item
      if (item && box.height === item.height && !committedOrientations.has(box.cargoId)) {
        committedOrientations.set(box.cargoId, box.orientationKey)
      }
    }
    let points: PackingPoint[] = [{ x: 0, y: 0, z: 0 }]
    for (const box of ordered) {
      const origin = { x: box.x, y: box.y, z: box.z }
      points = normalizePoints(
        [
          ...points.filter((point) => pointKey(point) !== pointKey(origin)),
          { x: box.x + box.length, y: box.y, z: box.z },
          { x: box.x, y: box.y + box.width, z: box.z },
          { x: box.x, y: box.y, z: box.z + box.height },
        ],
        effective,
      )
    }
    extremePoints = points
  }

  const bindChoice = (choice: PackingBlockChoice): PackingBlockChoice => {
    const cargo = cargoStates.find((entry) => (
      entry.item.id === choice.cargoId && entry.itemIndex === choice.state.itemIndex
    )) ?? cargoStates.find((entry) => entry.item.id === choice.cargoId)
    return cargo ? { ...choice, state: cargo } : choice
  }

  const fillResidualBlocks = () => {
    // Include residual groundOnly too — canPlace already forces z==0, and EMS/block
    // exhaustion can leave free floor that only extreme-point singles can fill.
    const residualStates = cargoStates.filter((state) => state.remaining > 0)
    const fallbackStates = loadingMode === 'quantity'
      ? residualStates.sort((a, b) => b.remaining - a.remaining || cargoVolume(b.item) - cargoVolume(a.item))
      : residualStates
    const emsOriginPoints = () => emsList.map((space) => ({ x: space.x, y: space.y, z: space.z }))
    for (const state of fallbackStates) {
      const usesTops = canUseTopSurfacePoints(state.item)
      const residualPointsFor = () => usesTops
        ? normalizePoints([...extremePoints, ...emsOriginPoints(), ...topSurfacePoints(placed, state.item)], effective)
        : normalizePoints([...extremePoints, ...emsOriginPoints()], effective)
      let residualPoints = residualPointsFor()
      let pointsAtPlacedLen = placed.length
      while (state.remaining > 0) {
        if (usedWeight + state.item.weight > effective.maxWeight + EPSILON) break
        if (pointsAtPlacedLen !== placed.length) {
          residualPoints = residualPointsFor()
          pointsAtPlacedLen = placed.length
        }
        const placement = bestPlacement(
          state.item,
          effective,
          placed,
          residualPoints,
          0,
          loadingMode === 'quantity',
          false,
          false,
          committedOrientations.get(state.item.id),
          minSupportRatio,
          placedNearby,
          placedByIdLive,
        )
        if (!placement) break
        placeEntry({
          item: state.item,
          itemIndex: state.itemIndex,
          label: state.label,
          index: state.nextIndex,
        }, placement, GAP_FILL_SOURCE)
        emsList = splitEMS(emsList, {
          x: placement.point.x,
          y: placement.point.y,
          z: placement.point.z,
          length: placement.box.length,
          width: placement.box.width,
          height: placement.box.height,
        })
        state.remaining -= 1
        state.nextIndex += 1
      }
    }
  }

  const runGreedyBlockEngine = () => {
    placeBlocks((choice) => choice.state.item.groundOnly === true && choice.point.z <= EPSILON)
    placeBlocks((choice) => !choice.state.item.groundOnly)
    fillResidualBlocks()
  }

  const useBlockEngine = shouldUseBlockEngine(cargoStates.map((state) => state.item), loadingMode, effective)

  if (useBlockEngine) {
    const searchHooks = {
      commit: (state: PackingSearchState, choice: PackingBlockChoice) => {
        applySearchState(clonePackingSearchState(state))
        commitBlock(bindChoice(choice))
        return snapshotSearchState()
      },
      complete: (state: PackingSearchState) => {
        applySearchState(clonePackingSearchState(state))
        runGreedyBlockEngine()
        return snapshotSearchState()
      },
      quality: packingQualityOf,
    }
    const searchBudget = {
      ...DEFAULT_QUANTITY_SEARCH_BUDGET,
      maxMs: 1500,
    }
    if (loadingMode === 'quantity' || loadingMode === 'volume') {
      const { state, search } = optimizePacking(snapshotSearchState(), searchBudget, searchHooks, loadingMode)
      if (loadingMode === 'quantity') {
        const repairStartedAt = Date.now()
        const repaired = repairQuantityPackingGap(state, searchHooks)
        publishSearchStats({
          ...search,
          strategy: repaired.state === state ? search.strategy : 'gap-repair',
          statesExpanded: search.statesExpanded + repaired.completions,
          candidatesEvaluated: search.candidatesEvaluated + repaired.candidatesEvaluated,
          elapsedMs: search.elapsedMs + Date.now() - repairStartedAt,
        })
        applySearchState(repaired.state)
      } else {
        publishSearchStats(search)
        applySearchState(state)
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
    const orientationCache = new Map<string, BoxOrientation[]>()
    const orientationsOf = (item: CargoItem) => {
      const cached = orientationCache.get(item.id)
      if (cached) return cached
      const next = orientations(item)
      orientationCache.set(item.id, next)
      return next
    }
    while (remaining.length > 0) {
      const placedById = placedByIdLive
      let best: { score: number; box: BoxOrientation; point: PackingPoint; idx: number } | undefined
      // Top-surface candidates depend only on current placed set + item stack rules; cache per item/iteration.
      const topPointsByItemId = new Map<string, PackingPoint[]>()

      for (let idx = 0; idx < remaining.length; idx += 1) {
        const entry = remaining[idx]
        const item = entry.item
        const itemOrientations = orientationsOf(item)
        if (itemOrientations.every((box) => !fitsInsideContainer({ x: 0, y: 0, z: 0 }, box, effective))) {
          continue
        }
        if (usedWeight + item.weight > effective.maxWeight + EPSILON) {
          continue
        }
        for (const box of itemOrientations) {
          if (box.length > effective.length || box.width > effective.width || box.height > effective.height) {
            continue
          }
          let topPassengerPoints = topPointsByItemId.get(item.id)
          if (topPassengerPoints === undefined) {
            topPassengerPoints = canUseTopSurfacePoints(item) && placed.length > 0
              ? normalizePoints(topSurfacePoints(placed, item), effective)
              : []
            topPointsByItemId.set(item.id, topPassengerPoints)
          }
          const candidatePointSets = topPassengerPoints.length > 0 ? [topPassengerPoints, extremePoints] : [extremePoints]
          for (const candidatePoints of candidatePointSets) {
            for (const point of candidatePoints) {
              // Volume mode evaluates many (item, orientation, point) triples per commit. Grid
              // query overhead dominates here; linear placed scans stay cheaper and equivalent.
              if (!canPlace(point, box, effective, placed, placedById, item, 0, false, minSupportRatio)) continue
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
          canUseTopSurfacePoints(item)
            ? [...extremePoints, ...topSurfacePoints(placed, item)]
            : extremePoints,
          effective,
        ),
        reservedTopPassengerHeight,
        loadingMode === 'quantity',
        reserveTopPassengerStackSlot,
        loadingMode === 'quantity',
        committedOrientations.get(item.id),
        minSupportRatio,
        placedNearby,
        placedByIdLive,
      )
      if (!placement) {
        markUnplaced(item, entry.label, UNPLACED_REASON_CODES.NO_SPACE)
        noSpaceEntries.push(entry)
        continue
      }
      placeEntry(entry, placement)
    }

    const retryEntries = noSpaceEntries.filter((entry) => canUseTopSurfacePoints(entry.item))
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
        minSupportRatio,
        placedNearby,
        placedByIdLive,
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

  const finalized = finalizePlacementGeometry(placed, effective)

  // Generate compliance diagnostics under the finalized Z-gravity support relations.
  const diagnostics = buildDiagnostics(
    finalized.placed,
    unplaced,
    effective,
    usedWeight,
    volumeUtilization,
    new Map(cargoItems.map((item) => [item.id, {
      ...item,
      maxStackLayers: effectiveMaxStackLayers(item, defaultMaxStackLayers),
    }])),
  )

  const labelStats = buildLabelStats(cargoItems, finalized.placed)

  return {
    placed: finalized.placed,
    unplaced,
    layers: finalized.layers,
    workSteps: finalized.workSteps,
    labelStats,
    diagnostics,
    totalCargoCount,
    placedCount: finalized.placed.length,
    usedVolume,
    containerVolume,
    volumeUtilization,
    usedWeight,
    weightUtilization,
  }
}
