import { initEMS, splitEMS } from './emsSpace'
import { generateBlockCandidates, selectBlockCandidate } from './packingCandidates'
import { canStageBlock } from './packingFeasibility'
import { largestInterCargoGap } from './packingLayoutQuality'
import { comparePackingQuality, packingQualityOf, type PackingObjective } from './packingObjective'
import type { PackingSearchHooks } from './packingSearch'
import { clonePackingSearchState, type PackingSearchState } from './packingSearchState'

const EPSILON = 0.001

export type SlotRelocationBudget = {
  /** Unused until a follow-up wires seed into a deterministic search or deletes it. */
  seed: number
  maxRounds: number
  maxMs: number
}

export type SlotRelocationResult = {
  state: PackingSearchState
  improved: boolean
  rounds: number
  budgetExceeded: boolean
}

function rebuildEms(state: PackingSearchState) {
  let emsList = initEMS(state.container)
  for (const box of state.placed) {
    emsList = splitEMS(emsList, {
      x: box.x,
      y: box.y,
      z: box.z,
      length: box.length,
      width: box.width,
      height: box.height,
    })
  }
  return emsList
}

function gapOf(state: PackingSearchState) {
  return largestInterCargoGap(state.placed, state.container)
}

function restoreRemoved(state: PackingSearchState, removedIds: Set<string>) {
  const next = clonePackingSearchState(state)
  const removed = next.placed.filter((box) => removedIds.has(box.id))
  next.placed = next.placed.filter((box) => !removedIds.has(box.id))
  next.placedById = new Map(next.placed.map((box) => [box.id, box]))
  for (const box of removed) {
    const cargo = next.cargoStates.find((entry) => entry.item.id === box.cargoId)
    if (!cargo) continue
    cargo.remaining += 1
    next.usedWeight = Math.max(0, next.usedWeight - box.weight)
  }
  next.emsList = rebuildEms(next)
  return next
}

function refill(state: PackingSearchState, hooks: PackingSearchHooks, objective: PackingObjective, deadline: number) {
  let current = clonePackingSearchState(state)
  const rejected = new Set<string>()
  while (current.cargoStates.some((cargo) => cargo.remaining > 0)) {
    if (Date.now() >= deadline) return { state: current, budgetExceeded: true }
    const generated = generateBlockCandidates(current, objective)
      .filter((choice) => !rejected.has([
        choice.cargoId,
        choice.block.orientationKey,
        choice.block.nx,
        choice.block.ny,
        choice.block.nz,
        choice.point.x,
        choice.point.y,
        choice.point.z,
      ].join(':')))
    const choice = selectBlockCandidate(generated, objective, current)
    if (!choice) break
    const key = [
      choice.cargoId,
      choice.block.orientationKey,
      choice.block.nx,
      choice.block.ny,
      choice.block.nz,
      choice.point.x,
      choice.point.y,
      choice.point.z,
    ].join(':')
    if (!canStageBlock(current, choice)) {
      rejected.add(key)
      if (rejected.size > 64) break
      continue
    }
    current = hooks.commit(clonePackingSearchState(current), choice)
    rejected.clear()
  }
  return { state: hooks.complete(clonePackingSearchState(current)), budgetExceeded: Date.now() >= deadline }
}

/**
 * Bounded local re-placement around the largest inter-cargo gap.
 * Not called from calculatePacking. Quantity must not drop.
 */
export function relocateLargestBoundarySlot(
  complete: PackingSearchState,
  hooks: PackingSearchHooks,
  objective: PackingObjective,
  budget: SlotRelocationBudget = { seed: 1, maxRounds: 1, maxMs: 250 },
): SlotRelocationResult {
  const startedAt = Date.now()
  let current = clonePackingSearchState(complete)
  let improved = false
  let rounds = 0
  let budgetExceeded = false
  const maxRounds = Math.max(0, budget.maxRounds)

  while (rounds < maxRounds) {
    if (Date.now() - startedAt >= budget.maxMs) {
      budgetExceeded = true
      break
    }
    rounds += 1
    const gap = gapOf(current)
    if (!gap || !gap.touchesBoundary) break

    const doorSide = current.placed.filter((box) => {
      if (gap.axis === 'x') return box.x + box.length > gap.maxX - EPSILON && box.z < gap.maxZ + EPSILON && box.z + box.height > gap.minZ - EPSILON
      return box.y + box.width > gap.maxY - EPSILON && box.z < gap.maxZ + EPSILON && box.z + box.height > gap.minZ - EPSILON
    })
    if (doorSide.length === 0) break

    const opened = restoreRemoved(current, new Set(doorSide.map((box) => box.id)))
    const filled = refill(opened, hooks, objective, startedAt + budget.maxMs)
    budgetExceeded = budgetExceeded || filled.budgetExceeded
    const before = packingQualityOf(current)
    const after = packingQualityOf(filled.state)
    if (objective === 'quantity' && after.placedCount < before.placedCount) continue
    if (comparePackingQuality(after, before, objective) < 0) {
      current = filled.state
      improved = true
    }
  }

  return { state: current, improved, rounds, budgetExceeded }
}
