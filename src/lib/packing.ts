import type { CargoItem, ContainerSpec, LoadingMode, PackingDiagnostic, PackingResult, PlacedBox } from '../types'
import { effectiveContainer, getContainerVolume } from '../data/containers'
import { assignDepthLayers, buildPackingLayers } from './layers'

type BoxSize = {
  length: number
  width: number
  height: number
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

export function orientations(item: CargoItem): BoxSize[] {
  const base = { length: item.length, width: item.width, height: item.height }
  if (!item.canRotate) {
    return [base]
  }

  const options = [
    base,
    { length: item.width, width: item.length, height: item.height },
    { length: item.length, width: item.height, height: item.width },
    { length: item.height, width: item.length, height: item.width },
    { length: item.width, width: item.height, height: item.length },
    { length: item.height, width: item.width, height: item.length },
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
          score:
            point.x * container.width * container.height +
            point.y * container.height +
            point.z +
            (container.height - box.height) / 100000,
        })),
    )
    .sort((a, b) => a.score - b.score || b.box.length * b.box.width - a.box.length * a.box.width)[0]
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
  const unplacedMap = new Map<string, { cargoId: string; name: string; label: string; quantity: number; reason: string }>()
  let usedWeight = 0
  let totalCargoCount = 0

  const loadingMode = options.loadingMode ?? 'volume'
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

  for (const entry of expanded) {
    const item = entry.item
    const markUnplaced = (reason: string) => {
      const current = unplacedMap.get(item.id)
      unplacedMap.set(item.id, {
        cargoId: item.id,
        name: item.name,
        label: entry.label,
        quantity: (current?.quantity ?? 0) + 1,
        reason,
      })
    }

    if (orientations(item).every((box) => !fitsInsideContainer({ x: 0, y: 0, z: 0 }, box, effective))) {
      markUnplaced('Exceeds container dimensions')
      continue
    }

    if (usedWeight + item.weight > effective.maxWeight) {
      markUnplaced('Exceeds maximum payload')
      continue
    }

    const placement = bestPlacement(item, effective, placed, extremePoints)
    if (!placement) {
      markUnplaced('No remaining loading space')
      continue
    }
    const { box, point } = placement
    const support = supportDetails(point, box, placed)

    placed.push({
      id: `${item.id}-${entry.index}`,
      cargoId: item.id,
      name: item.name,
      label: entry.label,
      index: entry.index,
      x: point.x,
      y: point.y,
      z: point.z,
      length: box.length,
      width: box.width,
      height: box.height,
      weight: item.weight,
      color: item.color,
      stackable: item.stackable,
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
    usedWeight += item.weight
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
