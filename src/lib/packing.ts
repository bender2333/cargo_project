import type { CargoItem, ContainerSpec, PackingResult, PlacedBox } from '../types'
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
    { length: item.length, width: item.height, height: item.width },
    { length: item.height, width: item.width, height: item.length },
    { length: item.width, width: item.height, height: item.length },
    { length: item.height, width: item.length, height: item.width },
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

function hasGravitySupport(point: Point, box: BoxSize, placed: PlacedBox[]) {
  if (point.z <= EPSILON) {
    return true
  }

  const baseArea = box.length * box.width
  const supportedArea = placed
    .filter((candidate) => candidate.stackable && Math.abs(candidate.z + candidate.height - point.z) <= EPSILON)
    .reduce((area, candidate) => {
      const overlapX = Math.max(
        0,
        Math.min(point.x + box.length, candidate.x + candidate.length) - Math.max(point.x, candidate.x),
      )
      const overlapY = Math.max(
        0,
        Math.min(point.y + box.width, candidate.y + candidate.width) - Math.max(point.y, candidate.y),
      )
      return area + overlapX * overlapY
    }, 0)

  return supportedArea / baseArea >= 0.8
}

function canPlace(point: Point, box: BoxSize, container: ContainerSpec, placed: PlacedBox[]) {
  return (
    fitsInsideContainer(point, box, container) &&
    hasGravitySupport(point, box, placed) &&
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
    .sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
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
            point.z * container.length * container.width +
            point.y * container.length +
            point.x +
            (container.height - box.height) / 100000,
        })),
    )
    .sort((a, b) => a.score - b.score || b.box.length * b.box.width - a.box.length * a.box.width)[0]
}

export function calculatePacking(container: ContainerSpec, cargoItems: CargoItem[]): PackingResult {
  const placed: PlacedBox[] = []
  let extremePoints: Point[] = [{ x: 0, y: 0, z: 0 }]
  const unplacedMap = new Map<string, { cargoId: string; name: string; quantity: number; reason: string }>()
  let usedWeight = 0
  let totalCargoCount = 0

  const expanded = cargoItems
    .flatMap((item) => {
      totalCargoCount += item.quantity
      return Array.from({ length: item.quantity }, (_, index) => ({ item, index: index + 1 }))
    })
    .sort((a, b) => b.item.length * b.item.width * b.item.height - a.item.length * a.item.width * a.item.height)

  for (const entry of expanded) {
    const item = entry.item
    const markUnplaced = (reason: string) => {
      const current = unplacedMap.get(item.id)
      unplacedMap.set(item.id, {
        cargoId: item.id,
        name: item.name,
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

    placed.push({
      id: `${item.id}-${entry.index}`,
      cargoId: item.id,
      name: item.name,
      label: item.label || labelForIndex(placed.length),
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

  return {
    placed,
    unplaced: [...unplacedMap.values()],
    totalCargoCount,
    placedCount: placed.length,
    usedVolume,
    containerVolume,
    volumeUtilization: containerVolume ? (usedVolume / containerVolume) * 100 : 0,
    usedWeight,
    weightUtilization: container.maxWeight ? (usedWeight / container.maxWeight) * 100 : 0,
  }
}
