import type { CargoItem, ContainerSpec, PackingDiagnostic, PackingLayer, PackingResult, PlacedBox } from '../types'
import { getContainerVolume } from '../data/containers'

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

function buildLayers(placed: PlacedBox[]): PackingLayer[] {
  const groups = new Map<number, PlacedBox[]>()
  placed.forEach((box) => {
    groups.set(box.physicalLayer, [...(groups.get(box.physicalLayer) ?? []), box])
  })

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([physicalLayer, boxes]) => {
      const labelCounts = new Map<string, { label: string; color: string; count: number }>()
      boxes.forEach((box) => {
        const current = labelCounts.get(box.label)
        labelCounts.set(box.label, {
          label: box.label,
          color: box.color,
          count: (current?.count ?? 0) + 1,
        })
      })

      return {
        id: String(physicalLayer),
        physicalLayer,
        minZ: Math.min(...boxes.map((box) => box.z)),
        maxZ: Math.max(...boxes.map((box) => box.z + box.height)),
        count: boxes.length,
        weight: boxes.reduce((sum, box) => sum + box.weight, 0),
        volume: boxes.reduce((sum, box) => sum + box.length * box.width * box.height, 0),
        labels: [...labelCounts.values()].sort((a, b) => a.label.localeCompare(b.label)),
        supportedBy: [...new Set(boxes.flatMap((box) => box.supportedBy))].sort(),
      }
    })
}

function buildDiagnostics(placed: PlacedBox[], unplaced: PackingResult['unplaced']): PackingDiagnostic[] {
  const diagnostics: PackingDiagnostic[] = []

  if (placed.some((box) => box.supportType === 'partially-supported')) {
    diagnostics.push({
      id: 'partial-support',
      severity: 'warning',
      message: 'Some boxes are only partially supported.',
    })
  }

  unplaced.forEach((item) => {
    diagnostics.push({
      id: `unplaced-${item.cargoId}`,
      severity: 'warning',
      message: `${item.label} ${item.name}: ${item.quantity} unplaced because ${item.reason}.`,
    })
  })

  if (diagnostics.length === 0) {
    diagnostics.push({
      id: 'packing-valid',
      severity: 'info',
      message: 'Calculated packing satisfies boundary, weight, overlap, and stacking checks.',
    })
  }

  return diagnostics
}

export function calculatePacking(container: ContainerSpec, cargoItems: CargoItem[]): PackingResult {
  const placed: PlacedBox[] = []
  let extremePoints: Point[] = [{ x: 0, y: 0, z: 0 }]
  const unplacedMap = new Map<string, { cargoId: string; name: string; label: string; quantity: number; reason: string }>()
  let usedWeight = 0
  let totalCargoCount = 0

  const expanded = cargoItems
    .flatMap((item, itemIndex) => {
      totalCargoCount += item.quantity
      const label = (item.label || labelForIndex(itemIndex)).toUpperCase().slice(0, 2)
      return Array.from({ length: item.quantity }, (_, index) => ({ item, label, index: index + 1 }))
    })
    .sort((a, b) => b.item.length * b.item.width * b.item.height - a.item.length * a.item.width * a.item.height)

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

    if (orientations(item).every((box) => !fitsInsideContainer({ x: 0, y: 0, z: 0 }, box, container))) {
      markUnplaced('Exceeds container dimensions')
      continue
    }

    if (usedWeight + item.weight > container.maxWeight) {
      markUnplaced('Exceeds maximum payload')
      continue
    }

    const placement = bestPlacement(item, container, placed, extremePoints)
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
      container,
    )
    usedWeight += item.weight
  }

  const usedVolume = placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
  const containerVolume = getContainerVolume(container)
  const unplaced = [...unplacedMap.values()]
  const layers = buildLayers(placed)
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
    diagnostics: buildDiagnostics(placed, unplaced),
    totalCargoCount,
    placedCount: placed.length,
    usedVolume,
    containerVolume,
    volumeUtilization: containerVolume ? (usedVolume / containerVolume) * 100 : 0,
    usedWeight,
    weightUtilization: container.maxWeight ? (usedWeight / container.maxWeight) * 100 : 0,
  }
}
