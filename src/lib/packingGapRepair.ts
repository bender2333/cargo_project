import { initEMS, splitEMS } from './emsSpace'
import { generateBlockCandidates } from './packingCandidates'
import { canStageBlock } from './packingFeasibility'
import { largestInterCargoGap } from './packingLayoutQuality'
import { comparePackingQuality } from './packingObjective'
import type { PackingSearchHooks } from './packingSearch'
import { clonePackingSearchState, type PackingSearchState } from './packingSearchState'

const EPSILON = 0.001
const MAX_COMPLETIONS = 4

/** Keep a support-closed lower load and return the entire affected upper layer to demand. */
export function reopenGapLayer(complete: PackingSearchState): PackingSearchState | null {
  const gap = largestInterCargoGap(complete.placed, complete.container)
  if (!gap) return null
  const beside = complete.placed.filter((box) => (
    box.z < gap.maxZ && box.z + box.height > gap.minZ
    && (gap.axis === 'x'
      ? box.y < gap.maxY && box.y + box.width > gap.minY
      : box.x < gap.maxX && box.x + box.length > gap.minX)
  ))
  const base = Math.min(...beside.map((box) => box.z))
  if (!Number.isFinite(base) || base <= EPSILON) return null

  const reopened = clonePackingSearchState(complete)
  const removed = reopened.placed.filter((box) => box.z + box.height > base + EPSILON)
  reopened.placed = reopened.placed.filter((box) => box.z + box.height <= base + EPSILON)
  if (reopened.placed.length === 0 || removed.length === 0) return null

  for (const cargo of reopened.cargoStates) {
    cargo.remaining += removed.filter((box) => box.cargoId === cargo.item.id).length
    // Keep nextIndex from the complete load so refills cannot reuse a retained id.
  }
  reopened.usedWeight = reopened.placed.reduce((sum, box) => sum + box.weight, 0)
  reopened.placedById = new Map(reopened.placed.map((box) => [box.id, box]))
  reopened.emsList = initEMS(reopened.container)
  for (const box of reopened.placed) reopened.emsList = splitEMS(reopened.emsList, box)
  return reopened
}

/** Repair a visible slot without trading away the quantity result already found. */
export function repairQuantityPackingGap(complete: PackingSearchState, hooks: PackingSearchHooks) {
  let state = complete
  let candidatesEvaluated = 0
  let completions = 0
  if (!complete.cargoStates.some((cargo) => cargo.remaining > 0)) {
    return { state, candidatesEvaluated, completions }
  }
  const reopened = reopenGapLayer(complete)
  if (!reopened) return { state, candidatesEvaluated, completions }

  const before = hooks.quality(complete)
  let best = before
  const choices = generateBlockCandidates(reopened, 'quantity').sort((a, b) => (
    b.block.count - a.block.count || b.block.volume - a.block.volume
  ))
  for (const choice of choices) {
    if (completions >= MAX_COMPLETIONS) break
    candidatesEvaluated += 1
    if (!canStageBlock(reopened, choice)) continue
    const candidate = hooks.complete(hooks.commit(clonePackingSearchState(reopened), choice))
    completions += 1
    const quality = hooks.quality(candidate)
    if (quality.placedCount < before.placedCount
      || quality.interCargoMaxMm >= before.interCargoMaxMm
      || quality.internalNotchVolume > before.internalNotchVolume) continue
    if (comparePackingQuality(quality, best, 'quantity') < 0) {
      state = candidate
      best = quality
    }
  }
  return { state, candidatesEvaluated, completions }
}
