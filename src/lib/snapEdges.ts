import type { ContainerSpec, PlacedBox } from '../types'

export const EDGE_SNAP_TOLERANCE_MM = 30

/**
 * Snap a candidate footprint to the nearest container wall, container centerline, or
 * neighbouring box edge within `tolerance` millimetres. Returns the (possibly snapped)
 * top-left corner; the caller is responsible for downstream validation.
 *
 * Priority is wall > neighbour edge > centerline; the closest qualifying candidate wins.
 * The function is pure and stateless so it is safe to call on every pointer move.
 */
export function snapToEdges(params: {
  x: number
  y: number
  length: number
  width: number
  /** Boxes already placed in the scene (the dragged box should be excluded). */
  others: PlacedBox[]
  container: Pick<ContainerSpec, 'length' | 'width'>
  /** Only snap when |delta| <= tolerance. Pass 0 to disable. */
  tolerance?: number
  /** When false, the function returns the input unchanged. */
  enabled?: boolean
}): { x: number; y: number; snappedAxes: ('x' | 'y')[] } {
  const { x, y, length, width, others, container } = params
  const tolerance = params.tolerance ?? EDGE_SNAP_TOLERANCE_MM
  if (params.enabled === false || tolerance <= 0) {
    return { x, y, snappedAxes: [] }
  }

  const xCandidates: number[] = [0, container.length - length, (container.length - length) / 2]
  const yCandidates: number[] = [0, container.width - width, (container.width - width) / 2]
  for (const o of others) {
    xCandidates.push(o.x, o.x + o.length - length, o.x + o.length, o.x - length)
    yCandidates.push(o.y, o.y + o.width - width, o.y + o.width, o.y - width)
  }

  const snappedAxes: ('x' | 'y')[] = []
  let nextX = x
  let nextY = y

  let bestX: { value: number; delta: number } | null = null
  for (const cand of xCandidates) {
    const delta = Math.abs(cand - x)
    if (delta <= tolerance && (!bestX || delta < bestX.delta)) {
      bestX = { value: cand, delta }
    }
  }
  if (bestX) {
    nextX = bestX.value
    snappedAxes.push('x')
  }

  let bestY: { value: number; delta: number } | null = null
  for (const cand of yCandidates) {
    const delta = Math.abs(cand - y)
    if (delta <= tolerance && (!bestY || delta < bestY.delta)) {
      bestY = { value: cand, delta }
    }
  }
  if (bestY) {
    nextY = bestY.value
    snappedAxes.push('y')
  }

  return { x: nextX, y: nextY, snappedAxes }
}
