import type { ContainerSpec, Locale, PlacedBox } from '../types'

export type ClearanceMeasurements = {
  left: number
  right: number
  front: number
  door: number
  floor: number
  top: number
  nearestLeft: number | null
  nearestRight: number | null
  nearestFront: number | null
  nearestDoor: number | null
  nearestFloor: number | null
  nearestTop: number | null
  nearestX: number | null
  nearestY: number | null
  nearestZ: number | null
}

export type Point3D = {
  x: number
  y: number
  z: number
}

export type ClearanceDirection = 'left' | 'right' | 'front' | 'door' | 'floor' | 'top'
export type ClearanceAnnotation = {
  direction: ClearanceDirection
  value: number
  target: 'wall' | 'neighbor'
  label: string
}

export type MeasurementAxis = 'x' | 'y' | 'z' | 'spatial'

export type MeasurementAnchor = {
  kind: 'point'
  point: Point3D
}

export type MeasurementAnnotation = {
  id: string
  from: MeasurementAnchor
  to: MeasurementAnchor
  axis: MeasurementAxis
  distance: number
  locked: boolean
  label: string
  hidden: boolean
  stale?: boolean
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

function anchorFromPoint(point: Point3D): MeasurementAnchor {
  return { kind: 'point', point: { ...point } }
}

export function createMeasurementAnnotation(input: {
  id: string
  from: Point3D
  to: Point3D
  axis?: MeasurementAxis
  label?: string
}): MeasurementAnnotation {
  const axis = input.axis ?? 'spatial'
  const distance = axis === 'x'
    ? Math.abs(input.to.x - input.from.x)
    : axis === 'y'
      ? Math.abs(input.to.y - input.from.y)
      : axis === 'z'
        ? Math.abs(input.to.z - input.from.z)
        : measureDistance(input.from, input.to)

  return {
    id: input.id,
    from: anchorFromPoint(input.from),
    to: anchorFromPoint(input.to),
    axis,
    distance,
    locked: true,
    label: input.label ?? '',
    hidden: false,
  }
}

export function renameMeasurementAnnotation(
  annotations: MeasurementAnnotation[],
  id: string,
  label: string,
): MeasurementAnnotation[] {
  return annotations.map((annotation) => annotation.id === id ? { ...annotation, label } : annotation)
}

export function deleteMeasurementAnnotation(annotations: MeasurementAnnotation[], id: string): MeasurementAnnotation[] {
  return annotations.filter((annotation) => annotation.id !== id)
}

export function measureBoxClearance(
  box: Pick<PlacedBox, 'id' | 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>,
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
  boxes: Array<Pick<PlacedBox, 'id' | 'x' | 'y' | 'z' | 'length' | 'width' | 'height'>>,
): ClearanceMeasurements {
  const others = boxes.filter((other) => other.id !== box.id)
  const xGaps = others
    .filter((other) => overlapsOnAxes(box, other, ['y', 'z']))
  const doorGaps = xGaps.map((other) => other.x - (box.x + box.length)).filter((gap) => gap >= 0)
  const frontGaps = xGaps.map((other) => box.x - (other.x + other.length)).filter((gap) => gap >= 0)
  const yGaps = others
    .filter((other) => overlapsOnAxes(box, other, ['x', 'z']))
  const rightGaps = yGaps.map((other) => other.y - (box.y + box.width)).filter((gap) => gap >= 0)
  const leftGaps = yGaps.map((other) => box.y - (other.y + other.width)).filter((gap) => gap >= 0)
  const zGaps = others
    .filter((other) => overlapsOnAxes(box, other, ['x', 'y']))
  const topGaps = zGaps.map((other) => other.z - (box.z + box.height)).filter((gap) => gap >= 0)
  const floorGaps = zGaps.map((other) => box.z - (other.z + other.height)).filter((gap) => gap >= 0)

  return {
    left: clampClearance(box.y),
    right: clampClearance(container.width - box.y - box.width),
    front: clampClearance(box.x),
    door: clampClearance(container.length - box.x - box.length),
    floor: clampClearance(box.z),
    top: clampClearance(container.height - box.z - box.height),
    nearestLeft: nearestPositiveGap(leftGaps),
    nearestRight: nearestPositiveGap(rightGaps),
    nearestFront: nearestPositiveGap(frontGaps),
    nearestDoor: nearestPositiveGap(doorGaps),
    nearestFloor: nearestPositiveGap(floorGaps),
    nearestTop: nearestPositiveGap(topGaps),
    nearestX: nearestPositiveGap([...frontGaps, ...doorGaps]),
    nearestY: nearestPositiveGap([...leftGaps, ...rightGaps]),
    nearestZ: nearestPositiveGap([...floorGaps, ...topGaps]),
  }
}

const clearanceDirectionLabels: Record<Locale, Record<ClearanceDirection, string>> = {
  en: {
    left: 'left',
    right: 'right',
    front: 'front',
    door: 'door',
    floor: 'floor',
    top: 'top',
  },
  zh: {
    left: '左侧',
    right: '右侧',
    front: '前端',
    door: '门侧',
    floor: '底部',
    top: '顶部',
  },
}

function nearestForDirection(clearance: ClearanceMeasurements, direction: ClearanceDirection) {
  if (direction === 'front') return clearance.nearestFront
  if (direction === 'door') return clearance.nearestDoor
  if (direction === 'left') return clearance.nearestLeft
  if (direction === 'right') return clearance.nearestRight
  if (direction === 'floor') return clearance.nearestFloor
  return clearance.nearestTop
}

export function deriveClearanceAnnotations(
  clearance: ClearanceMeasurements,
  locale: Locale,
  epsilon = 1,
): ClearanceAnnotation[] {
  const directions: ClearanceDirection[] = ['left', 'right', 'front', 'door', 'floor', 'top']
  return directions.flatMap((direction) => {
    const wallGap = clearance[direction]
    const neighborGap = nearestForDirection(clearance, direction)
    const target = neighborGap !== null && neighborGap < wallGap ? 'neighbor' : 'wall'
    const value = target === 'neighbor' && neighborGap !== null ? neighborGap : wallGap
    if (value <= epsilon) return []
    return [{
      direction,
      value,
      target,
      label: `${clearanceDirectionLabels[locale][direction]} ${formatMeasurement(value, locale)}`,
    }]
  })
}

export function formatMeasurement(value: number | null, locale: Locale) {
  if (value === null) return locale === 'zh' ? '无' : 'none'
  if (value >= 1000) return `${(value / 1000).toFixed(2)} m`
  return `${Math.round(value)} mm`
}
