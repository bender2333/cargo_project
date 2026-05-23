import type { ContainerSpec, PlacedBox } from '../types'

export type CogVector = { x: number; y: number; z: number }

export type CogResult = {
  /** Weighted center of mass of placed cargo, in container-local mm. */
  cog: CogVector
  /** Geometric center of the container interior, in container-local mm. */
  center: CogVector
  /** cog − center, signed mm. */
  offset: CogVector
  /** Total weight of placed cargo, kg. */
  totalWeight: number
  /** True when any |offset| / dimension exceeds CRITICAL_RATIO. */
  warning: boolean
  /** True when the offset is within COMFORT_RATIO of center on every axis. */
  balanced: boolean
}

export const COMFORT_RATIO = 0.05 // 5% of container dimension → green
export const CRITICAL_RATIO = 0.1 // 10% of container dimension → red warning

/**
 * Compute the weighted center of gravity of placed cargo and its offset
 * from the geometric center of the container.
 *
 * - x is along container.length, y along container.width, z along container.height.
 * - Origin is the container's near-floor corner: x ∈ [0, length], y ∈ [0, width], z ∈ [0, height].
 * - Each placed box contributes its centroid weighted by its weight (kg).
 * - When no cargo has weight, returns a zero offset and warning=false.
 */
export function computeCenterOfGravity(boxes: PlacedBox[], container: ContainerSpec): CogResult {
  const center: CogVector = {
    x: container.length / 2,
    y: container.width / 2,
    z: container.height / 2,
  }
  let totalWeight = 0
  let sx = 0
  let sy = 0
  let sz = 0
  for (const box of boxes) {
    if (!Number.isFinite(box.weight) || box.weight <= 0) continue
    const cx = box.x + box.length / 2
    const cy = box.y + box.width / 2
    const cz = box.z + box.height / 2
    sx += cx * box.weight
    sy += cy * box.weight
    sz += cz * box.weight
    totalWeight += box.weight
  }
  if (totalWeight <= 0) {
    return { cog: { ...center }, center, offset: { x: 0, y: 0, z: 0 }, totalWeight: 0, warning: false, balanced: true }
  }
  const cog: CogVector = { x: sx / totalWeight, y: sy / totalWeight, z: sz / totalWeight }
  const offset: CogVector = { x: cog.x - center.x, y: cog.y - center.y, z: cog.z - center.z }
  const rx = Math.abs(offset.x) / container.length
  const ry = Math.abs(offset.y) / container.width
  const rz = Math.abs(offset.z) / container.height
  const warning = rx > CRITICAL_RATIO || ry > CRITICAL_RATIO || rz > CRITICAL_RATIO
  const balanced = rx <= COMFORT_RATIO && ry <= COMFORT_RATIO && rz <= COMFORT_RATIO
  return { cog, center, offset, totalWeight, warning, balanced }
}
