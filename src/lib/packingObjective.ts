import { layoutCompactness } from './packingLayoutQuality'
import { scoreRemainingEmsQuality } from './packingLookahead'
import type { PackingSearchState } from './packingSearchState'

export type PackingObjective = 'quantity' | 'volume'

export type PackingQuality = {
  placedCount: number
  usedVolume: number
  internalNotchVolume: number
  unsupportedSpanRisk: number
  interCargoMaxMm: number
  deadEmsVolume: number
  externalResidualVolume: number
  placementTieBreak: string
}

function placementTieBreakOf(state: PackingSearchState) {
  return state.placed
    .slice()
    .sort((a, b) => a.workStep - b.workStep || a.index - b.index || a.id.localeCompare(b.id))
    .map((box) => `${box.workStep}:${box.orientationKey}:${box.x}:${box.y}:${box.z}`)
    .join('|')
}

export function packingQualityOf(state: PackingSearchState): PackingQuality {
  const compactness = layoutCompactness(state.placed, state.container, state.placedById)
  const leftover = scoreRemainingEmsQuality(state.emsList, state.cargoStates)
  return {
    placedCount: state.placed.length,
    usedVolume: state.placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0),
    internalNotchVolume: compactness.internalNotchVolume,
    unsupportedSpanRisk: compactness.unsupportedSpanRisk,
    interCargoMaxMm: compactness.interCargoMaxMm,
    deadEmsVolume: leftover.deadVolume,
    externalResidualVolume: compactness.externalResidualVolume,
    placementTieBreak: placementTieBreakOf(state),
  }
}

function compareCompactness(a: PackingQuality, b: PackingQuality) {
  const leftTie = a.placementTieBreak ?? ''
  const rightTie = b.placementTieBreak ?? ''
  return a.internalNotchVolume - b.internalNotchVolume
    || a.unsupportedSpanRisk - b.unsupportedSpanRisk
    || a.interCargoMaxMm - b.interCargoMaxMm
    || a.deadEmsVolume - b.deadEmsVolume
    || a.externalResidualVolume - b.externalResidualVolume
    || (leftTie < rightTie ? -1 : leftTie > rightTie ? 1 : 0)
}

/** Negative means a is better than b (same convention as compareBlockPlacement). */
export function comparePackingQuality(
  a: PackingQuality,
  b: PackingQuality,
  objective: PackingObjective,
): number {
  if (objective === 'volume') {
    const volumeDelta = b.usedVolume - a.usedVolume
    if (volumeDelta !== 0) return volumeDelta
  }

  const countDelta = b.placedCount - a.placedCount
  if (countDelta !== 0) return countDelta

  return compareCompactness(a, b)
}
