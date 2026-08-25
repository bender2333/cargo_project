import { bestBlocksForSpace } from './blocks'
import { generateBlockCandidates, type PackingBlockChoice } from './packingCandidates'
import { canStageBlock } from './packingFeasibility'
import { comparePackingQuality, type PackingQuality } from './packingObjective'
import { clonePackingSearchState, type PackingSearchState } from './packingSearchState'

export type PackingSearchBudget = {
  beamWidth: number
  depth: number
  maxStates: number
  maxMs: number
}

export const DEFAULT_QUANTITY_SEARCH_BUDGET: PackingSearchBudget = {
  beamWidth: 8,
  depth: 2,
  maxStates: 32,
  maxMs: 8000,
}

export type PackingSearchStats = {
  strategy: 'greedy' | 'beam'
  statesExpanded: number
  candidatesEvaluated: number
  budgetExceeded: boolean
}

/**
 * packingSearch.ts must NOT import packing.ts (cycle).
 * packing.ts imports packingSearch and supplies completion.
 */
export type PackingSearchHooks = {
  /** Commit one feasible block; return a new state (clone-on-write). */
  commit: (state: PackingSearchState, choice: PackingBlockChoice) => PackingSearchState
  /**
   * Finish from this state: remaining greedy block commits + existing residual fill.
   * Must return a complete layout (no further block commits). Same legality as production.
   */
  complete: (state: PackingSearchState) => PackingSearchState
  quality: (state: PackingSearchState) => PackingQuality
}

function usedVolumeOf(state: PackingSearchState) {
  return state.placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
}

function maxBlockCount(item: PackingSearchState['cargoStates'][number]['item'], remaining: number, space: PackingSearchState['emsList'][number]) {
  let best = 0
  for (const block of bestBlocksForSpace(item, remaining, space)) {
    if (block.count > best) best = block.count
  }
  return best
}

export function optimisticCountBound(state: PackingSearchState): number {
  const placedCount = state.placed.length
  let remainingQty = 0
  let skuGeometric = 0
  for (const cargo of state.cargoStates) {
    if (cargo.remaining <= 0) continue
    remainingQty += cargo.remaining
    let fitted = 0
    for (const ems of state.emsList) {
      fitted += maxBlockCount(cargo.item, cargo.remaining, ems)
    }
    skuGeometric += Math.min(cargo.remaining, fitted)
  }

  let emsGeometric = 0
  for (const ems of state.emsList) {
    let best = 0
    for (const cargo of state.cargoStates) {
      if (cargo.remaining <= 0) continue
      best = Math.max(best, maxBlockCount(cargo.item, cargo.remaining, ems))
    }
    emsGeometric += best
  }

  return placedCount + Math.max(remainingQty, skuGeometric, emsGeometric)
}

export function optimizePacking(
  initial: PackingSearchState,
  budget: PackingSearchBudget,
  hooks: PackingSearchHooks,
): { state: PackingSearchState; search: PackingSearchStats } {
  const startedAt = Date.now()
  let beamWidth = Math.max(1, budget.beamWidth)
  let statesExpanded = 0
  let candidatesEvaluated = 0
  let budgetExceeded = false
  let strategy: PackingSearchStats['strategy'] = 'greedy'

  const outOfTime = () => budget.maxMs <= 0 || Date.now() - startedAt >= budget.maxMs
  const outOfStates = () => statesExpanded >= budget.maxStates

  const incumbentState = hooks.complete(clonePackingSearchState(initial))
  let incumbent = incumbentState
  let incumbentQuality = hooks.quality(incumbent)

  const consider = (state: PackingSearchState) => {
    const quality = hooks.quality(state)
    if (comparePackingQuality(quality, incumbentQuality, 'quantity') < 0) {
      incumbent = state
      incumbentQuality = quality
      strategy = 'beam'
    }
  }

  if (budget.maxStates <= 0 || outOfTime()) {
    return {
      state: incumbent,
      search: {
        strategy: 'greedy',
        statesExpanded,
        candidatesEvaluated,
        budgetExceeded: true,
      },
    }
  }

  const remainingAfterIncumbent = incumbent.cargoStates.reduce((sum, cargo) => sum + Math.max(0, cargo.remaining), 0)
  if (remainingAfterIncumbent <= 0) {
    return {
      state: incumbent,
      search: {
        strategy: 'greedy',
        statesExpanded,
        candidatesEvaluated,
        budgetExceeded: false,
      },
    }
  }

  const incumbentMs = Math.max(1, Date.now() - startedAt)
  if (beamWidth > 4 && incumbentMs * (beamWidth + 1) > budget.maxMs) {
    beamWidth = 4
  }

  const expand = (state: PackingSearchState): PackingSearchState[] => {
    if (outOfTime() || outOfStates()) {
      budgetExceeded = true
      return []
    }

    const generated = generateBlockCandidates(state, 'quantity')
    const ranked: Array<{ state: PackingSearchState; bound: number; placed: number; volume: number }> = []
    for (const choice of generated) {
      candidatesEvaluated += 1
      if (outOfTime() || outOfStates()) {
        budgetExceeded = true
        break
      }
      if (!canStageBlock(state, choice)) continue
      const next = hooks.commit(clonePackingSearchState(state), choice)
      statesExpanded += 1
      ranked.push({
        state: next,
        bound: optimisticCountBound(next),
        placed: next.placed.length,
        volume: usedVolumeOf(next),
      })
    }

    ranked.sort((a, b) => b.bound - a.bound || b.placed - a.placed || b.volume - a.volume)
    return ranked.slice(0, beamWidth).map((entry) => entry.state)
  }

  const completeLeaves = (leaves: PackingSearchState[]) => {
    for (const leaf of leaves) {
      if (outOfTime()) {
        budgetExceeded = true
        return
      }
      consider(hooks.complete(clonePackingSearchState(leaf)))
    }
  }

  const depth = Math.max(0, budget.depth)
  const first = depth >= 1 ? expand(initial) : []
  completeLeaves(first)

  if (depth >= 2 && !outOfTime() && !outOfStates()) {
    const second: PackingSearchState[] = []
    for (const state of first) {
      if (outOfTime() || outOfStates()) {
        budgetExceeded = true
        break
      }
      second.push(...expand(state))
    }
    completeLeaves(second)
  }

  return {
    state: incumbent,
    search: {
      strategy,
      statesExpanded,
      candidatesEvaluated,
      budgetExceeded,
    },
  }
}
