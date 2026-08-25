import type { CargoItem, ContainerSpec, PlacementBox, PlacedBox } from '../types'
import type { SpatialAabb } from './spatialGrid'
import { stackCapacity, type StackChainNode } from './stackCapacity'
import type { PackingBlockChoice } from './packingCandidates'
import type { PackingSearchState } from './packingSearchState'

export type BoxSize = {
  length: number
  width: number
  height: number
}

export type StackLimitCarrier = {
  stackable: boolean
  maxStackLayers?: number
  groundOnly?: boolean
}

export type PackingPoint = {
  x: number
  y: number
  z: number
}

const EPSILON = 0.001
export const MINIMUM_SUPPORT_RATIO = 0.5

export function isSupportRatioAccepted(supportRatio: number, minimumSupportRatio = MINIMUM_SUPPORT_RATIO) {
  return !(supportRatio < minimumSupportRatio)
}

export function fitsInsideContainer(point: PackingPoint, box: BoxSize, container: ContainerSpec) {
  return (
    point.x + box.length <= container.length + EPSILON &&
    point.y + box.width <= container.width + EPSILON &&
    point.z + box.height <= container.height + EPSILON
  )
}

function overlaps(a: PlacementBox, point: PackingPoint, box: BoxSize) {
  return !(
    point.x + box.length <= a.x + EPSILON ||
    a.x + a.length <= point.x + EPSILON ||
    point.y + box.width <= a.y + EPSILON ||
    a.y + a.width <= point.y + EPSILON ||
    point.z + box.height <= a.z + EPSILON ||
    a.z + a.height <= point.z + EPSILON
  )
}

function supportOverlap(candidate: PlacementBox, point: PackingPoint, box: BoxSize) {
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

export function supportDetails(point: PackingPoint, box: BoxSize, placed: PlacementBox[]) {
  if (point.z <= EPSILON) {
    return {
      supportedArea: box.length * box.width,
      supportRatio: 1,
      supportedBy: [] as PlacementBox[],
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

/**
 * Reject placements that would make the new box an illegal supporter of boxes
 * already sitting above the candidate slot. Downward-only checks miss this case:
 * a capacity-one box inserted under an existing stack only becomes illegal after
 * the final support graph is reconciled.
 *
 * Only the local geometric column above the candidate is inspected — rebuilding the
 * full support graph on every canPlace call is O(n²) and too expensive for dense loads.
 */
function respectsStackCapacityWithUpwardRiders(
  point: PackingPoint,
  box: BoxSize,
  item: StackLimitCarrier,
  support: ReturnType<typeof supportDetails>,
  placed: PlacementBox[],
  placedById: Map<string, StackChainNode>,
  placedNearby?: (aabb: SpatialAabb) => PlacementBox[],
  containerHeight = Number.MAX_SAFE_INTEGER,
) {
  const candidateTop = point.z + box.height
  // Direct riders sit on the candidate top face; the canPlace `placed` arg is already the
  // local nearby subset (or full placed when no index). Filter that set only.
  const directRiders = placed.filter((candidate) => {
    if (Math.abs(candidate.z - candidateTop) > EPSILON) return false
    const overlapX = Math.max(
      0,
      Math.min(point.x + box.length, candidate.x + candidate.length) - Math.max(point.x, candidate.x),
    )
    const overlapY = Math.max(
      0,
      Math.min(point.y + box.width, candidate.y + candidate.width) - Math.max(point.y, candidate.y),
    )
    return overlapX * overlapY > 0
  })
  if (directRiders.length === 0) return true

  // Dependents may sit on a rider outside the candidate column footprint; expand to the
  // union of direct-rider AABBs upward before inverting support edges.
  let depMinX = point.x
  let depMinY = point.y
  let depMaxX = point.x + box.length
  let depMaxY = point.y + box.width
  for (const rider of directRiders) {
    depMinX = Math.min(depMinX, rider.x)
    depMinY = Math.min(depMinY, rider.y)
    depMaxX = Math.max(depMaxX, rider.x + rider.length)
    depMaxY = Math.max(depMaxY, rider.y + rider.width)
  }
  const dependentNeighborhood = placedNearby
    ? placedNearby({
        minX: depMinX - EPSILON,
        minY: depMinY - EPSILON,
        minZ: candidateTop - EPSILON,
        maxX: depMaxX + EPSILON,
        maxY: depMaxY + EPSILON,
        maxZ: containerHeight + EPSILON,
      })
    : placed
  const dependents = new Map<string, PlacementBox[]>()
  for (const existing of dependentNeighborhood) {
    for (const supportId of existing.supportedBy) {
      const list = dependents.get(supportId)
      if (list) list.push(existing)
      else dependents.set(supportId, [existing])
    }
  }

  const maxDepthAbove = (start: PlacementBox, seen = new Set<string>()): number => {
    if (seen.has(start.id)) return 0
    seen.add(start.id)
    const children = dependents.get(start.id) ?? []
    if (children.length === 0) return 1
    let best = 1
    for (const child of children) {
      best = Math.max(best, 1 + maxDepthAbove(child, new Set(seen)))
    }
    return best
  }

  const riderDepth = Math.max(...directRiders.map((rider) => maxDepthAbove(rider)))
  // Stack layers counting the candidate itself through the tallest rider chain.
  if (riderDepth + 1 > stackCapacity(item)) return false

  // Existing supporters below the candidate must still tolerate the taller chain.
  const stack: StackChainNode[] = [...support.supportedBy]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current.id)) continue
    visited.add(current.id)
    const topLayer = support.physicalLayer + riderDepth
    if (topLayer - current.physicalLayer + 1 > stackCapacity(current)) return false
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

export function canPlaceBox(
  point: PackingPoint,
  box: BoxSize,
  container: ContainerSpec,
  placed: PlacementBox[],
  placedById: Map<string, StackChainNode>,
  item: StackLimitCarrier,
  reservedTopPassengerHeight = 0,
  reserveTopPassengerStackSlot = false,
  minSupportRatio = MINIMUM_SUPPORT_RATIO,
  placedNearby?: (aabb: SpatialAabb) => PlacementBox[],
) {
  if (!fitsInsideContainer(point, box, container)) return false
  if (reservedTopPassengerHeight > 0 && stackCapacity(item) > 1 && point.z + box.height + reservedTopPassengerHeight > container.height + EPSILON) return false
  // `placed` is expected to already be a nearby subset when called from hot paths.
  if (!placed.every((candidate) => !overlaps(candidate, point, box))) return false

  const support = supportDetails(point, box, placed)
  if (!isSupportRatioAccepted(support.supportRatio, minSupportRatio)) return false
  if (reserveTopPassengerStackSlot && !preservesReservedTopPassengerStackSlot(support, placedById)) return false
  if (!respectsMaxStackLayers(support, placedById, item)) return false
  return respectsStackCapacityWithUpwardRiders(point, box, item, support, placed, placedById, placedNearby, container.height)
}

export { canPlaceBox as canPlace }

function blockUnitBox(choice: PackingBlockChoice): BoxSize {
  return {
    length: choice.block.box.length,
    width: choice.block.box.width,
    height: choice.block.box.height,
  }
}

function stageUnitBox(
  item: CargoItem,
  label: string,
  index: number,
  point: PackingPoint,
  box: BoxSize,
  supportPlaced: PlacementBox[],
  workStep: number,
  orientationKey: PlacedBox['orientationKey'],
): PlacementBox {
  const support = supportDetails(point, box, supportPlaced)
  return {
    id: `${item.id}-${index}`,
    cargoId: item.id,
    name: item.name,
    label,
    index,
    x: point.x,
    y: point.y,
    z: point.z,
    length: box.length,
    width: box.width,
    height: box.height,
    orientationKey,
    labelRotationDeg: 0,
    weight: item.weight,
    color: item.color,
    canRotate: item.canRotate,
    stackable: item.stackable,
    maxStackLayers: item.maxStackLayers,
    groundOnly: item.groundOnly,
    physicalLayer: support.physicalLayer,
    workStep,
    supportType: support.supportType,
    supportedBy: support.supportedBy.map((candidate) => candidate.id),
  }
}

/** Weight remaining + per-unit canPlaceBox. A block is illegal if any unit fails. */
export function canStageBlock(state: PackingSearchState, choice: PackingBlockChoice): boolean {
  if (state.usedWeight + choice.block.weight > state.container.maxWeight + EPSILON) return false
  const box = blockUnitBox(choice)
  const placedNearby = (aabb: SpatialAabb) => {
    void aabb
    return state.placed
  }
  const supportSet = state.placed.slice()
  const stagedById = new Map<string, StackChainNode>(state.placedById)
  let offset = 0
  let workStep = state.placed.length + 1
  for (let zIndex = 0; zIndex < choice.block.nz; zIndex += 1) {
    for (let xIndex = 0; xIndex < choice.block.nx; xIndex += 1) {
      for (let yIndex = 0; yIndex < choice.block.ny; yIndex += 1) {
        const point = {
          x: choice.point.x + xIndex * box.length,
          y: choice.point.y + yIndex * box.width,
          z: choice.point.z + zIndex * box.height,
        }
        const item = choice.state.item
        if (!canPlaceBox(point, box, state.container, supportSet, stagedById, item, 0, false, state.minSupportRatio, placedNearby)) {
          return false
        }
        const stagedBox = stageUnitBox(
          item,
          choice.state.label,
          choice.state.nextIndex + offset,
          point,
          box,
          supportSet,
          workStep,
          choice.block.orientationKey,
        )
        supportSet.push(stagedBox)
        stagedById.set(stagedBox.id, stagedBox)
        offset += 1
        workStep += 1
      }
    }
  }
  return true
}
