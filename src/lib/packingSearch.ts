import { bestBlocksForSpace } from './blocks'
import { splitEMS } from './emsSpace'
import { generateBlockCandidates, type PackingBlockChoice } from './packingCandidates'
import { canStageBlock } from './packingFeasibility'
import { comparePackingQuality, type PackingObjective, type PackingQuality } from './packingObjective'
import { clonePackingSearchState, type PackingSearchState } from './packingSearchState'

export type PackingSearchBudget = {
  beamWidth: number
  maxStates: number
  maxMs: number
  /** Optional expansion cap. Omit to search until maxStates or maxMs. */
  maxDepth?: number
}

export const DEFAULT_QUANTITY_SEARCH_BUDGET: PackingSearchBudget = {
  beamWidth: 8,
  maxStates: 32,
  maxMs: 8000,
}

export type PackingSearchStats = {
  strategy: 'greedy' | 'beam' | 'gap-repair'
  statesExpanded: number
  candidatesEvaluated: number
  budgetExceeded: boolean
  elapsedMs: number
  /** Search never claims a global optimum; this is the best complete found in budget. */
  claim: 'best-found-within-budget'
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
  /**
   * Optional test seam. Production omits this and uses canStageBlock / canPlaceBox
   * for every unit of the block. Hard constraints never skip this gate.
   */
  canStage?: (state: PackingSearchState, choice: PackingBlockChoice) => boolean
}

function usedVolumeOf(state: PackingSearchState) {
  return state.placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
}

function itemVolume(item: { length: number; width: number; height: number }) {
  return item.length * item.width * item.height
}

function remainingCargoVolume(cargoStates: PackingSearchState['cargoStates']) {
  let volume = 0
  for (const cargo of cargoStates) {
    volume += Math.max(0, cargo.remaining) * itemVolume(cargo.item)
  }
  return volume
}

function optimisticEmsUsableVolume(
  emsList: PackingSearchState['emsList'],
  cargoStates: PackingSearchState['cargoStates'],
) {
  const remainingVolume = remainingCargoVolume(cargoStates)
  if (remainingVolume <= 0) return 0
  let emsVolume = 0
  for (const ems of emsList) emsVolume += itemVolume(ems)
  return Math.min(remainingVolume, emsVolume)
}

export function optimisticVolumeBound(state: PackingSearchState): number {
  return usedVolumeOf(state) + optimisticEmsUsableVolume(state.emsList, state.cargoStates)
}

function maxBlockCount(item: PackingSearchState['cargoStates'][number]['item'], remaining: number, space: PackingSearchState['emsList'][number]) {
  let best = 0
  for (const block of bestBlocksForSpace(item, remaining, space)) {
    if (block.count > best) best = block.count
  }
  return best
}

function remainingDemand(cargoStates: PackingSearchState['cargoStates']) {
  let remainingQty = 0
  for (const cargo of cargoStates) remainingQty += Math.max(0, cargo.remaining)
  return remainingQty
}

function optimisticEmsCapacity(
  emsList: PackingSearchState['emsList'],
  cargoStates: PackingSearchState['cargoStates'],
) {
  const remainingQty = remainingDemand(cargoStates)
  if (remainingQty <= 0) return 0

  let emsGeometric = 0
  for (const ems of emsList) {
    let best = 0
    for (const cargo of cargoStates) {
      if (cargo.remaining <= 0) continue
      best = Math.max(best, maxBlockCount(cargo.item, cargo.remaining, ems))
    }
    emsGeometric += best
  }

  let skuGeometric = 0
  for (const cargo of cargoStates) {
    if (cargo.remaining <= 0) continue
    let fitted = 0
    for (const ems of emsList) fitted += maxBlockCount(cargo.item, cargo.remaining, ems)
    skuGeometric += Math.min(cargo.remaining, fitted)
  }

  return Math.min(remainingQty, Math.max(emsGeometric, skuGeometric))
}

export function optimisticCountBound(state: PackingSearchState): number {
  return state.placed.length + optimisticEmsCapacity(state.emsList, state.cargoStates)
}

/** Safe count bound: may overestimate, must not underestimate. Used only to prune. */
export function safeCountBound(state: PackingSearchState): number {
  return state.placed.length + remainingDemand(state.cargoStates)
}

/** Safe volume bound: remaining cargo volume, not dead EMS as real capacity. */
export function safeVolumeBound(state: PackingSearchState): number {
  return usedVolumeOf(state) + remainingCargoVolume(state.cargoStates)
}

function cannotBeatIncumbent(
  state: PackingSearchState,
  incumbent: PackingQuality,
  objective: PackingObjective,
) {
  if (objective === 'volume') return safeVolumeBound(state) < incumbent.usedVolume
  return safeCountBound(state) < incumbent.placedCount
}

function rankingBound(state: PackingSearchState, objective: PackingObjective) {
  return objective === 'volume' ? optimisticVolumeBound(state) : optimisticCountBound(state)
}

function searchStats(
  strategy: PackingSearchStats['strategy'],
  statesExpanded: number,
  candidatesEvaluated: number,
  budgetExceeded: boolean,
  elapsedMs: number,
): PackingSearchStats {
  return {
    strategy,
    statesExpanded,
    candidatesEvaluated,
    budgetExceeded,
    elapsedMs,
    claim: 'best-found-within-budget',
  }
}

function scoreChoice(state: PackingSearchState, choice: PackingBlockChoice, objective: PackingObjective) {
  const cargoStates = state.cargoStates.map((cargo) => {
    if (cargo.item.id !== choice.cargoId || cargo.itemIndex !== choice.state.itemIndex) return cargo
    return { ...cargo, remaining: cargo.remaining - choice.block.count }
  })
  const emsList = splitEMS(state.emsList, {
    x: choice.point.x,
    y: choice.point.y,
    z: choice.point.z,
    length: choice.block.length,
    width: choice.block.width,
    height: choice.block.height,
  })
  const placed = state.placed.length + choice.block.count
  const volume = usedVolumeOf(state) + choice.block.volume
  return {
    choice,
    bound: objective === 'volume'
      ? volume + optimisticEmsUsableVolume(emsList, cargoStates)
      : placed + optimisticEmsCapacity(emsList, cargoStates),
    placed,
    volume,
  }
}

export function optimizePacking(
  initial: PackingSearchState,
  budget: PackingSearchBudget,
  hooks: PackingSearchHooks,
  objective: PackingObjective,
): { state: PackingSearchState; search: PackingSearchStats; completes: PackingSearchState[] } {
  const startedAt = Date.now()
  let beamWidth = Math.max(1, budget.beamWidth)
  let statesExpanded = 0
  let candidatesEvaluated = 0
  let budgetExceeded = false
  let strategy: PackingSearchStats['strategy'] = 'greedy'
  const completes: PackingSearchState[] = []

  const outOfTime = () => budget.maxMs <= 0 || Date.now() - startedAt >= budget.maxMs
  const outOfStates = () => statesExpanded >= budget.maxStates

  const incumbentState = hooks.complete(clonePackingSearchState(initial))
  let incumbent = incumbentState
  let incumbentQuality = hooks.quality(incumbent)
  completes.push(incumbent)

  const recordComplete = (state: PackingSearchState) => {
    completes.push(state)
    const quality = hooks.quality(state)
    if (comparePackingQuality(quality, incumbentQuality, objective) < 0) {
      incumbent = state
      incumbentQuality = quality
      strategy = 'beam'
    }
  }

  const remainingAfterIncumbent = incumbent.cargoStates.reduce((sum, cargo) => sum + Math.max(0, cargo.remaining), 0)
  if (remainingAfterIncumbent <= 0) {
    return {
      state: incumbent,
      search: searchStats('greedy', statesExpanded, candidatesEvaluated, false, Date.now() - startedAt),
      completes,
    }
  }

  if (budget.maxStates <= 0 || outOfTime()) {
    return {
      state: incumbent,
      search: searchStats('greedy', statesExpanded, candidatesEvaluated, true, Date.now() - startedAt),
      completes,
    }
  }

  const incumbentMs = Math.max(1, Date.now() - startedAt)
  if (beamWidth > 4 && incumbentMs * (beamWidth + 1) > budget.maxMs) {
    beamWidth = 4
  }

  const isFeasible = hooks.canStage ?? canStageBlock

  const expand = (state: PackingSearchState): PackingSearchState[] => {
    if (outOfTime() || outOfStates()) {
      budgetExceeded = true
      return []
    }

    const generated = generateBlockCandidates(state, objective)
    const feasible: Array<ReturnType<typeof scoreChoice>> = []
    for (const choice of generated) {
      candidatesEvaluated += 1
      if (outOfTime()) {
        budgetExceeded = true
        break
      }
      if (!isFeasible(state, choice)) continue
      feasible.push(scoreChoice(state, choice, objective))
    }
    feasible.sort(objective === 'volume'
      ? (a, b) => b.bound - a.bound || b.volume - a.volume || b.placed - a.placed
      : (a, b) => b.bound - a.bound || b.placed - a.placed || b.volume - a.volume)

    const kept: PackingSearchState[] = []
    for (const entry of feasible) {
      if (kept.length >= beamWidth) break
      if (outOfTime() || outOfStates()) {
        budgetExceeded = true
        break
      }
      kept.push(hooks.commit(clonePackingSearchState(state), entry.choice))
      statesExpanded += 1
    }
    return kept
  }

  const completeLeaf = (leaf: PackingSearchState) => {
    if (outOfTime()) {
      budgetExceeded = true
      return
    }
    recordComplete(hooks.complete(clonePackingSearchState(leaf)))
  }

  type BeamNode = { state: PackingSearchState; depth: number }
  let beam: BeamNode[] = [{ state: initial, depth: 0 }]
  const maxDepth = budget.maxDepth

  while (beam.length > 0) {
    if (outOfTime() || outOfStates()) {
      budgetExceeded = true
      break
    }

    const nextBeam: BeamNode[] = []
    for (const node of beam) {
      if (outOfTime() || outOfStates()) {
        budgetExceeded = true
        break
      }
      if (maxDepth !== undefined && node.depth >= maxDepth) continue
      if (cannotBeatIncumbent(node.state, incumbentQuality, objective)) continue

      const children = expand(node.state)
      for (const child of children) {
        completeLeaf(child)
        nextBeam.push({ state: child, depth: node.depth + 1 })
      }
    }

    nextBeam.sort((a, b) => {
      const boundDelta = rankingBound(b.state, objective) - rankingBound(a.state, objective)
      if (boundDelta !== 0) return boundDelta
      return b.state.placed.length - a.state.placed.length
    })
    beam = nextBeam.slice(0, beamWidth)
  }

  return {
    state: incumbent,
    search: searchStats(strategy, statesExpanded, candidatesEvaluated, budgetExceeded, Date.now() - startedAt),
    completes,
  }
}
