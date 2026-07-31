import type { ContainerSpec, LoadingStep, PackingLayer, PlacementBox, PlacedBox } from '../types'
import { assignDepthLayers, buildPackingLayers } from './layers'

const EPSILON = 0.001

function supportOverlapArea(candidate: PlacementBox, box: PlacementBox) {
  if (Math.abs(candidate.z + candidate.height - box.z) > EPSILON) return 0
  const overlapX = Math.max(
    0,
    Math.min(box.x + box.length, candidate.x + candidate.length) - Math.max(box.x, candidate.x),
  )
  const overlapY = Math.max(
    0,
    Math.min(box.y + box.width, candidate.y + candidate.width) - Math.max(box.y, candidate.y),
  )
  return overlapX * overlapY
}

/**
 * Recompute vertical support fields from final coordinates.
 * Must run before depth waves and loading-order assignment.
 */
export function reconcileSupportRelations(placed: PlacementBox[]) {
  const byId = new Map(placed.map((box) => [box.id, box]))

  for (const box of [...placed].sort((a, b) => a.z - b.z)) {
    if (box.z <= EPSILON) {
      box.supportedBy = []
      box.supportType = 'floor'
      box.physicalLayer = 1
      continue
    }

    const baseArea = box.length * box.width
    let supportedArea = 0
    const supporters: string[] = []
    for (const candidate of placed) {
      if (candidate.id === box.id) continue
      const overlap = supportOverlapArea(candidate, box)
      if (overlap > 0) {
        supporters.push(candidate.id)
        supportedArea += overlap
      }
    }

    box.supportedBy = supporters
    if (supporters.length === 0) {
      box.supportType = 'partially-supported'
      box.physicalLayer = 1
      continue
    }

    const ratio = baseArea ? supportedArea / baseArea : 0
    box.supportType = ratio >= 1 - EPSILON ? 'fully-supported' : 'partially-supported'
    box.physicalLayer = Math.max(
      ...supporters.map((id) => byId.get(id)?.physicalLayer ?? 0),
      0,
    ) + 1
  }
}

function assertFinalizedDepthLayers(boxes: PlacementBox[]): asserts boxes is PlacedBox[] {
  for (const box of boxes) {
    if (!Number.isFinite(box.depthLayer) || (box.depthLayer ?? 0) <= 0) {
      throw new Error(`Placed box ${box.id} has invalid depthLayer`)
    }
  }
}

function loadingSequenceScore(box: PlacedBox, container: ContainerSpec) {
  return (
    box.x * container.width * container.height +
    box.y * container.height +
    box.z
  )
}

function compareCodeUnits(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Supporters first; among currently loadable boxes prefer far-wall-outward depth.
 */
export function assignWorkStepsBySupport(placed: PlacedBox[], container: ContainerSpec) {
  const ids = new Set<string>()
  for (const box of placed) {
    if (ids.has(box.id)) throw new Error(`Duplicate placed box id: ${box.id}`)
    ids.add(box.id)
  }
  const score = new Map(placed.map((box) => [box.id, loadingSequenceScore(box, container)]))
  const byId = new Map(placed.map((box) => [box.id, box]))

  const preferred = (a: PlacedBox, b: PlacedBox) =>
    (score.get(a.id) ?? 0) - (score.get(b.id) ?? 0) ||
    a.index - b.index ||
    compareCodeUnits(a.id, b.id)

  const remaining = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const box of placed) {
    const supporters = box.supportedBy.filter((id) => byId.has(id))
    remaining.set(box.id, supporters.length)
    for (const supporterId of supporters) {
      dependents.set(supporterId, [...(dependents.get(supporterId) ?? []), box.id])
    }
  }

  const ready = placed.filter((box) => (remaining.get(box.id) ?? 0) === 0).sort(preferred)
  const ordered: PlacedBox[] = []

  while (ready.length > 0) {
    const next = ready.shift()
    if (!next) break
    ordered.push(next)
    for (const dependentId of dependents.get(next.id) ?? []) {
      const left = (remaining.get(dependentId) ?? 0) - 1
      remaining.set(dependentId, left)
      if (left === 0) {
        const dependent = byId.get(dependentId)
        if (!dependent) continue
        const at = ready.findIndex((candidate) => preferred(dependent, candidate) < 0)
        if (at === -1) ready.push(dependent)
        else ready.splice(at, 0, dependent)
      }
    }
  }

  if (ordered.length < placed.length) {
    const orderedIds = new Set(ordered.map((box) => box.id))
    const cyclicIds = placed
      .filter((box) => !orderedIds.has(box.id))
      .map((box) => box.id)
      .sort(compareCodeUnits)
    throw new Error(`Cyclic support graph: ${cyclicIds.join(', ')}`)
  }

  ordered.forEach((box, index) => {
    box.workStep = index + 1
  })

  return ordered
}

export type FinalizedPlacementGeometry = {
  placed: PlacedBox[]
  layers: PackingLayer[]
  workSteps: LoadingStep[]
}

/**
 * Shared auto/manual finalizer: final coordinates -> support -> depth -> work order -> layers.
 */
export function finalizePlacementGeometry(
  boxes: PlacementBox[],
  container: ContainerSpec,
): FinalizedPlacementGeometry {
  const placed = boxes.map((box) => ({
    ...box,
    supportedBy: [...box.supportedBy],
    ...(box.orientationAxes ? { orientationAxes: { ...box.orientationAxes } } : {}),
  }))

  reconcileSupportRelations(placed)
  assignDepthLayers(placed)
  assertFinalizedDepthLayers(placed)
  const ordered = assignWorkStepsBySupport(placed, container)
  const layers = buildPackingLayers(placed)

  return {
    placed,
    layers,
    workSteps: ordered.map((box) => ({
      step: box.workStep,
      boxId: box.id,
      cargoId: box.cargoId,
      label: box.label,
      physicalLayer: box.physicalLayer,
      supportType: box.supportType,
    })),
  }
}
