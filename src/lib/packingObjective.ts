export type PackingObjective = 'quantity' | 'volume'

export type PackingQuality = {
  placedCount: number
  usedVolume: number
  internalNotchVolume: number
  interCargoMaxMm: number
  deadEmsVolume: number
  externalResidualVolume: number
}

function compareCompactness(a: PackingQuality, b: PackingQuality) {
  return a.internalNotchVolume - b.internalNotchVolume
    || a.interCargoMaxMm - b.interCargoMaxMm
    || a.deadEmsVolume - b.deadEmsVolume
    || a.externalResidualVolume - b.externalResidualVolume
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
