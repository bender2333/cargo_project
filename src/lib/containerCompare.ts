import { calculatePacking } from './packing'
import { getContainerVolume } from '../data/containers'
import type { CargoItem, ContainerSpec, LoadingMode } from '../types'

export type ContainerComparisonRow = {
  container: ContainerSpec
  placedCount: number
  totalCargoCount: number
  unplacedCount: number
  volumeUtilization: number
  weightUtilization: number
  usedVolume: number
  usedWeight: number
  containerVolume: number
  fit: 'full' | 'partial' | 'none'
}

/**
 * Run the packing algorithm against each container and produce a comparable
 * row of headline metrics. `containers` order is preserved in the output so the
 * caller can drive a stable column layout.
 */
export function compareContainers(
  containers: ContainerSpec[],
  cargoItems: CargoItem[],
  loadingMode: LoadingMode,
  defaultMaxStackLayers?: number,
): ContainerComparisonRow[] {
  return containers.map((container) => {
    const result = calculatePacking(container, cargoItems, { loadingMode, defaultMaxStackLayers })
    const total = result.totalCargoCount
    const placed = result.placedCount
    const unplaced = total - placed
    const fit: ContainerComparisonRow['fit'] = total === 0
      ? 'none'
      : placed === total
        ? 'full'
        : placed > 0
          ? 'partial'
          : 'none'
    return {
      container,
      placedCount: placed,
      totalCargoCount: total,
      unplacedCount: unplaced,
      volumeUtilization: result.volumeUtilization,
      weightUtilization: result.weightUtilization,
      usedVolume: result.usedVolume,
      usedWeight: result.usedWeight,
      containerVolume: getContainerVolume(container),
      fit,
    }
  })
}
