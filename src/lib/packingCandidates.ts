import { bestBlocksForSpace, maxBlocksForSpace, type BlockCandidate } from './blocks'
import type { EmptyMaximalSpace } from './emsSpace'
import {
  QUANTITY_COUNT_NEAR_WINDOW,
  assignRemainingQuality,
  compareBlockPlacement,
  compareRemainingEmsQuality,
  type RemainingEmsQuality,
} from './packingLookahead'
import type { PackingCargoState, PackingSearchState } from './packingSearchState'

const EPSILON = 0.001
const SHORT_CONTAINER_LENGTH_MM = 6000

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

function emsKey(ems: EmptyMaximalSpace) {
  return `${ems.x}:${ems.y}:${ems.z}:${ems.length}x${ems.width}x${ems.height}`
}

function isNearEqualPrimary(a: PackingBlockChoice, b: PackingBlockChoice, loadingMode: 'quantity' | 'volume') {
  if (loadingMode === 'quantity') {
    return Math.abs(a.block.count - b.block.count) <= QUANTITY_COUNT_NEAR_WINDOW
  }
  const maxVolume = Math.max(a.block.volume, b.block.volume)
  return Math.abs(a.block.volume - b.block.volume) <= maxVolume * 0.0001
}

function packingFrontDelta(a: PackingBlockChoice, b: PackingBlockChoice, preferVerticalFront: boolean) {
  if (preferVerticalFront) return a.point.z - b.point.z || a.point.y - b.point.y || a.point.x - b.point.x
  return a.point.x - b.point.x || a.point.z - b.point.z || a.point.y - b.point.y
}

/** Packing-front greedy: later EMS cannot win on a larger current block alone. */
function compareSelectBlockCandidate(
  a: PackingBlockChoice,
  b: PackingBlockChoice,
  loadingMode: 'quantity' | 'volume',
  preferVerticalFront: boolean,
) {
  const front = packingFrontDelta(a, b, preferVerticalFront)
  if (front !== 0) {
    if (!isNearEqualPrimary(a, b, loadingMode)) return front
    const quality = a.remainingQuality && b.remainingQuality
      ? compareRemainingEmsQuality(a.remainingQuality, b.remainingQuality)
      : 0
    if (quality !== 0 && a.cargoId === b.cargoId) return quality
    return front
  }
  return compareBlockPlacement(choiceMetrics(a), choiceMetrics(b), loadingMode)
}

function withRemainingQuality(
  candidates: PackingBlockChoice[],
  loadingMode: 'quantity' | 'volume',
  state: PackingSearchState,
): PackingBlockChoice[] {
  if (candidates.length === 0) return candidates

  const maxCount = Math.max(...candidates.map((choice) => choice.block.count))
  const maxVolume = Math.max(...candidates.map((choice) => choice.block.volume))
  const near = candidates.filter((choice) => (
    loadingMode === 'quantity'
      ? maxCount - choice.block.count <= QUANTITY_COUNT_NEAR_WINDOW
      : maxVolume - choice.block.volume <= maxVolume * 0.0001
  ))
  const frontier = candidates.filter((choice) => shouldUseFrontier(loadingMode, choice.ems, state.cargoStates))
  const nearFrontier = near.filter((choice) => shouldUseFrontier(loadingMode, choice.ems, state.cargoStates))
  const nearFrontierEms = new Set(nearFrontier.map((choice) => emsKey(choice.ems)))
  const nearEms = new Set(near.map((choice) => emsKey(choice.ems)))
  const toScore = loadingMode === 'volume'
    ? (nearEms.size > 1 ? near : [])
    : nearFrontierEms.size > 1
      ? nearFrontier
      : frontier
  if (toScore.length === 0) return candidates

  const scored = assignRemainingQuality(
    toScore,
    state.emsList,
    state.cargoStates.map((entry) => ({ item: entry.item, remaining: entry.remaining })),
    loadingMode,
  )
  const qualityByKey = new Map(scored.map((choice) => [candidateKey(choice), choice.remainingQuality]))
  return candidates.map((choice) => {
    const remainingQuality = qualityByKey.get(candidateKey(choice))
    return remainingQuality ? { ...choice, remainingQuality } : choice
  })
}

export function selectBlockCandidate(
  candidates: PackingBlockChoice[],
  loadingMode: 'quantity' | 'volume',
  state: PackingSearchState,
): PackingBlockChoice | undefined {
  if (candidates.length === 0) return undefined

  const pool = withRemainingQuality(candidates, loadingMode, state)
  // In a 20-foot-class container, quantity loading benefits from finishing the
  // current vertical front before opening the next longitudinal slot.
  const preferVerticalFront = loadingMode === 'quantity'
    && state.container.length <= SHORT_CONTAINER_LENGTH_MM
  let best: PackingBlockChoice | undefined
  for (const choice of pool) {
    if (!best || compareSelectBlockCandidate(choice, best, loadingMode, preferVerticalFront) < 0) {
      best = choice
    }
  }
  return best
}
