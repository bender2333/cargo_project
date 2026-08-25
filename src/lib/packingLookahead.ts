import type { CargoItem, LoadingMode } from '../types'
import { bestBlocksForSpace } from './blocks'
import { splitEMS, type EmptyMaximalSpace } from './emsSpace'

export const QUANTITY_COUNT_NEAR_WINDOW = 1
export const MAX_LOOKAHEAD_CANDIDATES = 32
/** Ignore leftover-shape noise smaller than 0.1 m³ so equal-count ranking stays stable. */
export const SIGNIFICANT_LEFTOVER_VOLUME = 100_000_000

export type RemainingCargo = {
  item: CargoItem
  remaining: number
}

export type RemainingEmsQuality = {
  /** Optimistic geometric size-fit bound from bestBlocksForSpace. Not a proven canPlace count. */
  nextCountBound: number
  /** Optimistic geometric size-fit bound. Not a proven placeable volume. */
  nextVolumeBound: number
  deadVolume: number
  narrowVolume: number
  fragmentCount: number
}

export type BlockChoiceMetrics = {
  cargoId?: string
  count: number
  volume: number
  footprintArea: number
  waste: number
  axisFill: number
  minAxisFill: number
  point: { x: number; y: number; z: number }
  quality?: RemainingEmsQuality
}

type ScoredBlockChoice = {
  block: { count: number; volume: number; length: number; width: number; height: number }
  point: { x: number; y: number; z: number }
  state: RemainingCargo
}

function volumeOf(space: Pick<EmptyMaximalSpace, 'length' | 'width' | 'height'>) {
  return space.length * space.width * space.height
}

function maxBlockInSpace(item: CargoItem, remaining: number, space: EmptyMaximalSpace) {
  const blocks = bestBlocksForSpace(item, remaining, space)
  let best: { count: number; volume: number } | undefined
  for (const block of blocks) {
    if (!best || block.count > best.count || (block.count === best.count && block.volume > best.volume)) {
      best = { count: block.count, volume: block.volume }
    }
  }
  return best
}

/**
 * Leftover EMS score from size-fit only (`bestBlocksForSpace`).
 * `nextCountBound` / `nextVolumeBound` are optimistic geometric bounds — they are not
 * proven canPlace / canStageBlock counts and must not be treated as committed capacity.
 */
export function scoreRemainingEmsQuality(
  emsList: EmptyMaximalSpace[],
  remaining: RemainingCargo[],
): RemainingEmsQuality {
  let nextCountBound = 0
  let nextVolumeBound = 0
  let deadVolume = 0
  let narrowVolume = 0
  let fragmentCount = 0

  let minEnterableEdge = Number.POSITIVE_INFINITY
  for (const cargo of remaining) {
    if (cargo.remaining <= 0) continue
    minEnterableEdge = Math.min(minEnterableEdge, cargo.item.length, cargo.item.width, cargo.item.height)
  }

  for (const ems of emsList) {
    const emsVolume = volumeOf(ems)
    let bestCount = 0
    let bestVolume = 0
    for (const cargo of remaining) {
      if (cargo.remaining <= 0) continue
      const fitted = maxBlockInSpace(cargo.item, cargo.remaining, ems)
      if (!fitted) continue
      if (fitted.count > bestCount) bestCount = fitted.count
      if (fitted.volume > bestVolume) bestVolume = fitted.volume
    }
    if (bestCount <= 0) {
      deadVolume += emsVolume
      continue
    }
    fragmentCount += 1
    if (bestCount > nextCountBound) nextCountBound = bestCount
    if (bestVolume > nextVolumeBound) nextVolumeBound = bestVolume
    if (Number.isFinite(minEnterableEdge) && Math.min(ems.length, ems.width) < minEnterableEdge * 2) {
      narrowVolume += emsVolume
    }
  }

  return { nextCountBound, nextVolumeBound, deadVolume, narrowVolume, fragmentCount }
}

export function compareRemainingEmsQuality(a: RemainingEmsQuality, b: RemainingEmsQuality) {
  const narrowDelta = a.narrowVolume - b.narrowVolume
  if (Math.abs(narrowDelta) >= SIGNIFICANT_LEFTOVER_VOLUME) return narrowDelta
  const deadDelta = a.deadVolume - b.deadVolume
  if (Math.abs(deadDelta) >= SIGNIFICANT_LEFTOVER_VOLUME) return deadDelta
  return b.nextCountBound - a.nextCountBound
    || b.nextVolumeBound - a.nextVolumeBound
    || a.fragmentCount - b.fragmentCount
    || narrowDelta
    || deadDelta
}

function leftoverIsNarrowChannel(quality: RemainingEmsQuality) {
  return quality.narrowVolume >= SIGNIFICANT_LEFTOVER_VOLUME && quality.nextCountBound > 0
}

function sameCargo(a: BlockChoiceMetrics, b: BlockChoiceMetrics) {
  return Boolean(a.cargoId && a.cargoId === b.cargoId)
}

export function compareBlockPlacement(a: BlockChoiceMetrics, b: BlockChoiceMetrics, loadingMode: LoadingMode) {
  const quality = a.quality && b.quality ? compareRemainingEmsQuality(a.quality, b.quality) : 0
  const qualityApplies = quality !== 0 && sameCargo(a, b)

  if (loadingMode === 'quantity') {
    const countDelta = b.count - a.count
    if (Math.abs(countDelta) > QUANTITY_COUNT_NEAR_WINDOW) return countDelta
    if (countDelta !== 0) {
      if (qualityApplies && a.quality && b.quality) {
        const moreQuality = countDelta > 0 ? b.quality : a.quality
        const fewerQuality = countDelta > 0 ? a.quality : b.quality
        if (leftoverIsNarrowChannel(moreQuality) && fewerQuality.narrowVolume < moreQuality.narrowVolume) return quality
      }
      return countDelta
    }
    if (qualityApplies) return quality
    return b.volume - a.volume
      || b.axisFill - a.axisFill
      || b.minAxisFill - a.minAxisFill
      || b.footprintArea - a.footprintArea
      || a.waste - b.waste
      || a.point.z - b.point.z
      || a.point.x - b.point.x
      || a.point.y - b.point.y
  }

  const volumeDelta = b.volume - a.volume
  if (volumeDelta !== 0) return volumeDelta
  if (qualityApplies) return quality
  return b.count - a.count
    || b.axisFill - a.axisFill
    || b.minAxisFill - a.minAxisFill
    || a.waste - b.waste
    || a.point.z - b.point.z
    || a.point.x - b.point.x
    || a.point.y - b.point.y
}

export function assignRemainingQuality<T extends ScoredBlockChoice>(
  choices: T[],
  emsList: EmptyMaximalSpace[],
  cargoStates: RemainingCargo[],
  loadingMode: LoadingMode,
): Array<T & { remainingQuality: RemainingEmsQuality }> {
  if (choices.length === 0) return []

  const maxCount = Math.max(...choices.map((choice) => choice.block.count))
  const maxVolume = Math.max(...choices.map((choice) => choice.block.volume))
  const near = choices.filter((choice) => (
    loadingMode === 'quantity'
      ? maxCount - choice.block.count <= QUANTITY_COUNT_NEAR_WINDOW
      : maxVolume - choice.block.volume <= maxVolume * 0.0001
  ))

  const ranked = near.slice().sort((a, b) => compareBlockPlacement({
    count: a.block.count,
    volume: a.block.volume,
    footprintArea: a.block.volume,
    waste: 0,
    axisFill: 0,
    minAxisFill: 0,
    point: a.point,
  }, {
    count: b.block.count,
    volume: b.block.volume,
    footprintArea: b.block.volume,
    waste: 0,
    axisFill: 0,
    minAxisFill: 0,
    point: b.point,
  }, loadingMode))

  const frontier = ranked.slice(0, MAX_LOOKAHEAD_CANDIDATES)
  return frontier.map((choice) => {
    const remaining = cargoStates.map((cargo) => (
      cargo.item === choice.state.item || cargo.item.id === choice.state.item.id
        ? { item: cargo.item, remaining: cargo.remaining - choice.block.count }
        : cargo
    ))
    const nextEms = splitEMS(emsList, {
      x: choice.point.x,
      y: choice.point.y,
      z: choice.point.z,
      length: choice.block.length,
      width: choice.block.width,
      height: choice.block.height,
    })
    return {
      ...choice,
      remainingQuality: scoreRemainingEmsQuality(nextEms, remaining),
    }
  })
}
