import type { ContainerSpec, PlacedBox } from '../types'
import { effectiveContainer } from '../data/containers'

export type RemainingCapacity = {
  totalVolume: number       // mm³
  usedVolume: number        // mm³
  remainingVolume: number   // mm³
  volumeRatio: number       // 0..1 used / total
  totalWeight: number       // kg
  usedWeight: number        // kg
  remainingWeight: number   // kg
  weightRatio: number       // 0..1 used / total
  floorArea: number         // mm²
  usedFloorArea: number     // mm² (sum of XY footprints of floor-level boxes)
  remainingFloorArea: number
  floorRatio: number        // 0..1
}

/**
 * Compute headline remaining capacity for the current container + placed boxes.
 * Returns absolute numbers + percentages for volume, weight, and floor footprint.
 */
export function computeRemainingCapacity(boxes: PlacedBox[], container: ContainerSpec): RemainingCapacity {
  const effective = effectiveContainer(container)
  const totalVolume = effective.length * effective.width * effective.height
  const floorArea = effective.length * effective.width

  let usedVolume = 0
  let usedWeight = 0
  let usedFloorArea = 0
  for (const box of boxes) {
    usedVolume += box.length * box.width * box.height
    if (Number.isFinite(box.weight) && box.weight > 0) usedWeight += box.weight
    if (Math.abs(box.z) < 1) usedFloorArea += box.length * box.width
  }

  const totalWeight = effective.maxWeight
  const volumeRatio = totalVolume > 0 ? Math.min(1, usedVolume / totalVolume) : 0
  const weightRatio = totalWeight > 0 ? Math.min(1, usedWeight / totalWeight) : 0
  const floorRatio = floorArea > 0 ? Math.min(1, usedFloorArea / floorArea) : 0

  return {
    totalVolume,
    usedVolume,
    remainingVolume: Math.max(0, totalVolume - usedVolume),
    volumeRatio,
    totalWeight,
    usedWeight,
    remainingWeight: Math.max(0, totalWeight - usedWeight),
    weightRatio,
    floorArea,
    usedFloorArea,
    remainingFloorArea: Math.max(0, floorArea - usedFloorArea),
    floorRatio,
  }
}
