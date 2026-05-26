import type { ContainerSpec, Locale, PlacedBox } from '../types'

export type ClearanceMeasurements = {
  left: number
  right: number
  front: number
  door: number
  floor: number
  top: number
  nearestX: number | null
  nearestY: number | null
  nearestZ: number | null
}

export type Point3D = {
  x: number
  y: number
  z: number
}

const clampClearance = (value: number) => Math.max(0, value)

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

function overlapsOnAxes(
  box: Pick<PlacedBox, 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>,
  other: Pick<PlacedBox, 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>,
  axes: Array<'x' | 'y' | 'z'>,
) {
  return axes.every((axis) => {
    if (axis === 'x') return overlap1d(box.x, box.x + box.length, other.x, other.x + other.length) > 0
    if (axis === 'y') return overlap1d(box.y, box.y + box.width, other.y, other.y + other.width) > 0
    return overlap1d(box.z, box.z + box.height, other.z, other.z + other.height) > 0
  })
}

function nearestPositiveGap(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0)
  if (valid.length === 0) return null
  return Math.min(...valid)
}

export function measureDistance(a: Point3D, b: Point3D) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function measureBoxClearance(
  box: Pick<PlacedBox, 'id' | 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>,
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
  boxes: Array<Pick<PlacedBox, 'id' | 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>>,
): ClearanceMeasurements {
  const others = boxes.filter((other) => other.id !== box.id)
  const xGaps = others
    .filter((other) => overlapsOnAxes(box, other, ['y', 'z']))
    .flatMap((other) => [
      other.x - (box.x + box.length),
      box.x - (other.x + other.length),
    ])
  const yGaps = others
    .filter((other) => overlapsOnAxes(box, other, ['x', 'z']))
    .flatMap((other) => [
      other.y - (box.y + box.width),
      box.y - (other.y + other.width),
    ])
  const zGaps = others
    .filter((other) => overlapsOnAxes(box, other, ['x', 'y']))
    .flatMap((other) => [
      other.z - (box.z + box.height),
      box.z - (other.z + other.height),
    ])

  return {
    left: clampClearance(box.y),
    right: clampClearance(container.width - box.y - box.width),
    front: clampClearance(box.x),
    door: clampClearance(container.length - box.x - box.length),
    floor: clampClearance(box.z),
    top: clampClearance(container.height - box.z - box.height),
    nearestX: nearestPositiveGap(xGaps),
    nearestY: nearestPositiveGap(yGaps),
    nearestZ: nearestPositiveGap(zGaps),
  }
}

export function formatMeasurement(value: number | null, locale: Locale) {
  if (value === null) return locale === 'zh' ? '无' : 'none'
  if (value >= 1000) return `${(value / 1000).toFixed(2)} m`
  return `${Math.round(value)} mm`
}
