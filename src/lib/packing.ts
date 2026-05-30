import type { CargoItem, ContainerSpec, LoadingMode, PackingDiagnostic, PackingResult, PlacedBox, UnplacedCargo } from '../types'
import { effectiveContainer, getContainerVolume } from '../data/containers'
import { assignDepthLayers, buildPackingLayers } from './layers'

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

type OrientationKey = PlacedBox['orientationKey']
type LabelRotationDeg = PlacedBox['labelRotationDeg']

type BoxOrientation = BoxSize & {
  orientationKey: OrientationKey
  labelRotationDeg: LabelRotationDeg
}

type Point = {
  x: number
  y: number
  z: number
}

const EPSILON = 0.001

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

function fitsInsideContainer(point: Point, box: BoxSize, container: ContainerSpec) {
  return (
    point.x + box.length <= container.length + EPSILON &&
    point.y + box.width <= container.width + EPSILON &&
    point.z + box.height <= container.height + EPSILON
  )
}

function overlaps(a: PlacedBox, point: Point, box: BoxSize) {
  return !(
    point.x + box.length <= a.x + EPSILON ||
    a.x + a.length <= point.x + EPSILON ||
    point.y + box.width <= a.y + EPSILON ||
    a.y + a.width <= point.y + EPSILON ||
    point.z + box.height <= a.z + EPSILON ||
    a.z + a.height <= point.z + EPSILON
  )
}

function supportOverlap(candidate: PlacedBox, point: Point, box: BoxSize) {
  if (!candidate.stackable || Math.abs(candidate.z + candidate.height - point.z) > EPSILON) {
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

function supportDetails(point: Point, box: BoxSize, placed: PlacedBox[]) {
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

function canPlace(point: Point, box: BoxSize, container: ContainerSpec, placed: PlacedBox[]) {
  return (
    fitsInsideContainer(point, box, container) &&
    supportDetails(point, box, placed).supportRatio >= 0.8 &&
    placed.every((candidate) => !overlaps(candidate, point, box))
  )
}

function pointKey(point: Point) {
  return `${Math.round(point.x)}:${Math.round(point.y)}:${Math.round(point.z)}`
}

function normalizePoints(points: Point[], container: ContainerSpec) {
  const seen = new Set<string>()
  return points
    .filter((point) => point.x <= container.length && point.y <= container.width && point.z <= container.height)
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

function placementScore(
  item: CargoItem,
  box: BoxOrientation,
  point: Point,
  placed: PlacedBox[],
  container: ContainerSpec,
) {
  // Discourage tilting (orientations where original height is no longer along z),
  // so realistic upright placement wins when both orientations fit comparably.
  const tiltPenalty = box.height === item.height ? 0 : container.length * container.width * container.height

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

  // Primary ordering: prefer placements deeper into the container (low x), then closer
  // to the side (low y), then lower (low z). Tiebreakers prefer taller and wider boxes
  // so that pinwheel arrangements emerge naturally for tightly packed pallet loads.
  return (
    tiltPenalty +
    point.x * container.width * container.height +
    point.y * container.height +
    point.z +
    (container.height - box.height) / 100000 +
    snapBonus -
    box.width * 0.01
  )
}

function bestPlacement(item: CargoItem, container: ContainerSpec, placed: PlacedBox[], points: Point[]) {
  return orientations(item)
    .filter(
      (option) =>
        option.length <= container.length &&
        option.width <= container.width &&
        option.height <= container.height,
    )
    .flatMap((box) =>
      points
        .filter((point) => canPlace(point, box, container, placed))
        .map((point) => ({
          box,
          point,
          score: placementScore(item, box, point, placed, container),
        })),
    )
    .sort((a, b) => a.score - b.score || b.box.width - a.box.width || b.box.length * b.box.width - a.box.length * a.box.width)[0]
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
  return placed.some((box) => box.supportedBy.some((supportId) => placedById.get(supportId)?.stackable === false))
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
      ? 'Stacking check failed: cargo was placed on a non-stackable item.'
      : 'Stacking check passed: non-stackable items are not used as supports.',
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

export function calculatePacking(container: ContainerSpec, cargoItems: CargoItem[], options: { loadingMode?: LoadingMode } = {}): PackingResult {
  const effective = effectiveContainer(container)
  const placed: PlacedBox[] = []
  let extremePoints: Point[] = [{ x: 0, y: 0, z: 0 }]
  const unplacedMap = new Map<string, UnplacedCargo>()
  let usedWeight = 0
  let totalCargoCount = 0

  const loadingMode = options.loadingMode ?? 'quantity'
  const expanded = cargoItems
    .flatMap((item, itemIndex) => {
      totalCargoCount += item.quantity
      const label = (item.label || labelForIndex(itemIndex)).toUpperCase().slice(0, 2)
      return Array.from({ length: item.quantity }, (_, index) => ({ item, itemIndex, label, index: index + 1 }))
    })
    .sort((a, b) => {
      if (loadingMode === 'input') {
        return a.itemIndex - b.itemIndex || a.index - b.index
      }
      if (loadingMode === 'weight') {
        return b.item.weight - a.item.weight || b.item.length * b.item.width * b.item.height - a.item.length * a.item.width * a.item.height
      }
      if (loadingMode === 'quantity') {
        return b.item.quantity - a.item.quantity || b.item.length * b.item.width * b.item.height - a.item.length * a.item.width * a.item.height
      }
      return b.item.length * b.item.width * b.item.height - a.item.length * a.item.width * a.item.height
    })

  const markUnplaced = (item: CargoItem, label: string, reasonCode: UnplacedReasonCode) => {
    const current = unplacedMap.get(item.id)
    unplacedMap.set(item.id, {
      cargoId: item.id,
      name: item.name,
      label,
      quantity: (current?.quantity ?? 0) + 1,
      reasonCode,
      reason: UNPLACED_REASON_MESSAGES[reasonCode],
    })
  }

  const placeEntry = (
    entry: { item: CargoItem; itemIndex: number; label: string; index: number },
    placement: { box: BoxOrientation; point: Point },
  ) => {
    const { box, point } = placement
    const support = supportDetails(point, box, placed)
    placed.push({
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
      stackable: entry.item.stackable,
      physicalLayer: support.physicalLayer,
      workStep: placed.length + 1,
      supportType: support.supportType,
      supportedBy: support.supportedBy.map((candidate) => candidate.id),
    })

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

  if (loadingMode === 'volume') {
    // Best-fit decreasing: at each step pick the best (entry, orientation, point) combo
    // across all remaining entries, so the algorithm naturally interleaves complementary
    // shapes (e.g., pinwheel packing for mixed pallet widths).
    const remaining = [...expanded]
    while (remaining.length > 0) {
      let best:
        | {
            score: number
            box: BoxOrientation
            point: Point
            idx: number
          }
        | null = null

      for (let idx = 0; idx < remaining.length; idx += 1) {
        const entry = remaining[idx]
        const item = entry.item
        if (orientations(item).every((box) => !fitsInsideContainer({ x: 0, y: 0, z: 0 }, box, effective))) {
          continue
        }
        if (usedWeight + item.weight > effective.maxWeight + EPSILON) {
          continue
        }
        for (const box of orientations(item)) {
          if (
            box.length > effective.length ||
            box.width > effective.width ||
            box.height > effective.height
          ) {
            continue
          }
          for (const point of extremePoints) {
            if (!canPlace(point, box, effective, placed)) continue
            const score = placementScore(item, box, point, placed, effective)
            if (
              best === null ||
              score < best.score ||
              (score === best.score && box.width > best.box.width)
            ) {
              best = { score, box, point, idx }
            }
          }
        }
      }

      if (!best) break
      const entry = remaining[best.idx]
      remaining.splice(best.idx, 1)
      placeEntry(entry, { box: best.box, point: best.point })
    }

    // Anything still in `remaining` is unplaced; categorize each by reason.
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
    for (const entry of expanded) {
      const item = entry.item

      if (orientations(item).every((box) => !fitsInsideContainer({ x: 0, y: 0, z: 0 }, box, effective))) {
        markUnplaced(item, entry.label, UNPLACED_REASON_CODES.EXCEEDS_DIMENSIONS)
        continue
      }

      if (usedWeight + item.weight > effective.maxWeight) {
        markUnplaced(item, entry.label, UNPLACED_REASON_CODES.EXCEEDS_PAYLOAD)
        continue
      }

      const placement = bestPlacement(item, effective, placed, extremePoints)
      if (!placement) {
        markUnplaced(item, entry.label, UNPLACED_REASON_CODES.NO_SPACE)
        continue
      }
      placeEntry(entry, placement)
    }
  }

  const usedVolume = placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
  const containerVolume = getContainerVolume(container)
  const unplaced = [...unplacedMap.values()]
  const volumeUtilization = containerVolume ? (usedVolume / containerVolume) * 100 : 0
  const weightUtilization = effective.maxWeight ? (usedWeight / effective.maxWeight) * 100 : 0

  // 1. Generate compliance diagnostics under original Z-gravity physical support relations
  const diagnostics = buildDiagnostics(placed, unplaced, effective, usedWeight, volumeUtilization)

  // 2. Perform inward physical layer mapping and pusher updates (depth layers)
  assignDepthLayers(placed)
  assignWorkStepsByDepth(placed, effective)
  const layers = buildPackingLayers(placed)

  const labelStats = cargoItems.map((item, itemIndex) => {
    const label = (item.label || labelForIndex(itemIndex)).toUpperCase().slice(0, 2)
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
