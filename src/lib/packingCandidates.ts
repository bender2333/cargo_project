import { bestBlocksForSpace, maxBlocksForSpace, type BlockCandidate } from './blocks'
import type { EmptyMaximalSpace } from './emsSpace'
import { assignRemainingQuality, compareBlockPlacement, type RemainingEmsQuality } from './packingLookahead'
import type { PackingCargoState, PackingSearchState } from './packingSearchState'

const EPSILON = 0.001

export type PackingBlockChoice = {
  cargoId: string
  state: PackingCargoState
  block: BlockCandidate
  ems: EmptyMaximalSpace
  point: { x: number; y: number; z: number }
  waste: number
  remainingQuality?: RemainingEmsQuality
}

function leadingCargoUnitHeight(states: PackingCargoState[]) {
  let minHeight = Number.POSITIVE_INFINITY
  for (const state of states) {
    if (state.remaining <= 0) continue
    minHeight = Math.min(minHeight, state.item.length, state.item.width, state.item.height)
  }
  return minHeight
}

function shouldUseFrontier(
  loadingMode: 'quantity' | 'volume',
  ems: EmptyMaximalSpace,
  cargoStates: PackingCargoState[],
) {
  return loadingMode === 'quantity' && ems.height < leadingCargoUnitHeight(cargoStates) * 2 - EPSILON
}

function candidateKey(choice: PackingBlockChoice) {
  return [
    choice.cargoId,
    choice.block.orientationKey,
    choice.block.nx,
    choice.block.ny,
    choice.block.nz,
    choice.point.x,
    choice.point.y,
    choice.point.z,
  ].join(':')
}

function emsAxisFill(choice: PackingBlockChoice) {
  return Math.max(choice.block.length / choice.ems.length, choice.block.width / choice.ems.width)
}

function emsMinAxisFill(choice: PackingBlockChoice) {
  return Math.min(choice.block.length / choice.ems.length, choice.block.width / choice.ems.width)
}

function choiceMetrics(choice: PackingBlockChoice) {
  return {
    cargoId: choice.cargoId,
    count: choice.block.count,
    volume: choice.block.volume,
    footprintArea: choice.block.footprintArea,
    waste: choice.waste,
    axisFill: emsAxisFill(choice),
    minAxisFill: emsMinAxisFill(choice),
    point: choice.point,
    quality: choice.remainingQuality,
  }
}

export function generateBlockCandidates(
  state: PackingSearchState,
  loadingMode: 'quantity' | 'volume',
  options?: { maxCandidates?: number },
): PackingBlockChoice[] {
  const spaces = state.emsList.slice().sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y)
  const seen = new Set<string>()
  const choices: PackingBlockChoice[] = []

  for (const ems of spaces) {
    const emsVolume = ems.length * ems.width * ems.height
    const blocksFor = shouldUseFrontier(loadingMode, ems, state.cargoStates) ? bestBlocksForSpace : maxBlocksForSpace
    for (const cargoState of state.cargoStates) {
      if (cargoState.remaining <= 0) continue
      for (const block of blocksFor(cargoState.item, cargoState.remaining, ems)) {
        if (state.usedWeight + block.weight > state.container.maxWeight + EPSILON) continue
        const choice: PackingBlockChoice = {
          cargoId: cargoState.item.id,
          state: cargoState,
          block,
          ems,
          point: { x: ems.x, y: ems.y, z: ems.z },
          waste: emsVolume - block.length * block.width * block.height,
        }
        const key = candidateKey(choice)
        if (seen.has(key)) continue
        seen.add(key)
        choices.push(choice)
      }
    }
  }

  if (options?.maxCandidates !== undefined && choices.length > options.maxCandidates) {
    return choices
      .slice()
      .sort((a, b) => compareBlockPlacement(choiceMetrics(a), choiceMetrics(b), loadingMode))
      .slice(0, options.maxCandidates)
  }
  return choices
}

export function selectBlockCandidate(
  candidates: PackingBlockChoice[],
  loadingMode: 'quantity' | 'volume',
  state: PackingSearchState,
): PackingBlockChoice | undefined {
  if (candidates.length === 0) return undefined

  const leftover: PackingBlockChoice[] = []
  const others: PackingBlockChoice[] = []
  for (const choice of candidates) {
    if (shouldUseFrontier(loadingMode, choice.ems, state.cargoStates)) leftover.push(choice)
    else others.push(choice)
  }

  const scoredLeftover = leftover.length > 0
    ? assignRemainingQuality(
      leftover,
      state.emsList,
      state.cargoStates.map((entry) => ({ item: entry.item, remaining: entry.remaining })),
      loadingMode,
    )
    : []

  const pool: PackingBlockChoice[] = [...scoredLeftover, ...others]
  let best: PackingBlockChoice | undefined
  for (const choice of pool) {
    if (!best || compareBlockPlacement(choiceMetrics(choice), choiceMetrics(best), loadingMode) < 0) {
      best = choice
    }
  }
  return best
}
