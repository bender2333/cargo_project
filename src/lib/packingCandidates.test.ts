import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { generateBlockCandidates, selectBlockCandidate } from './packingCandidates'
import { MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import type { PackingCargoState, PackingSearchState } from './packingSearchState'

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'cube',
    name: 'Cube',
    label: 'C',
    length: 1000,
    width: 1000,
    height: 1000,
    weight: 8,
    quantity: 20,
    color: '#64748b',
    canRotate: false,
    stackable: true,
    ...overrides,
  }
}

function container(overrides: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: 'two-ems',
    label: 'two-ems',
    description: 'injected disjoint EMS',
    length: 8000,
    width: 4000,
    height: 4000,
    maxWeight: 50_000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
    ...overrides,
  }
}

function stateFor(item: CargoItem, emsList: PackingSearchState['emsList'], remaining = item.quantity): PackingSearchState {
  const cargoState: PackingCargoState = {
    item,
    itemIndex: 0,
    label: item.label ?? 'C',
    remaining,
    nextIndex: 1,
  }
  return {
    container: container(),
    cargoStates: [cargoState],
    emsList,
    placed: [],
    placedById: new Map(),
    usedWeight: 0,
    minSupportRatio: MINIMUM_SUPPORT_RATIO,
  }
}

function candidateKey(choice: { cargoId: string; block: { orientationKey: string; nx: number; ny: number; nz: number }; point: { x: number; y: number; z: number } }) {
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

describe('cross-EMS block candidates', () => {
  it('keeps the origin EMS when a later space only offers a larger current count', () => {
    const item = cargo({ quantity: 10 })
    const origin = { x: 0, y: 0, z: 0, length: 1000, width: 1000, height: 1000 }
    const later = { x: 3000, y: 0, z: 0, length: 2000, width: 2000, height: 1000 }
    const state = stateFor(item, [origin, later])

    const candidates = generateBlockCandidates(state, 'quantity')
    expect(candidates.some((choice) => choice.point.x === origin.x)).toBe(true)
    expect(candidates.some((choice) => choice.point.x === later.x && choice.block.count > 1)).toBe(true)

    const picked = selectBlockCandidate(candidates, 'quantity', state)
    expect(picked).toBeDefined()
    expect(picked!.point.x).toBe(origin.x)
    expect(picked!.ems.x).toBe(origin.x)
  })

  it('keeps the origin EMS when a later space only offers a larger current volume', () => {
    const item = cargo({ quantity: 10 })
    const origin = { x: 0, y: 0, z: 0, length: 1000, width: 1000, height: 1000 }
    const later = { x: 4000, y: 0, z: 0, length: 2000, width: 2000, height: 1000 }
    const state = stateFor(item, [origin, later])

    const picked = selectBlockCandidate(generateBlockCandidates(state, 'volume'), 'volume', state)
    expect(picked).toBeDefined()
    expect(picked!.point.x).toBe(origin.x)
    expect(picked!.ems.x).toBe(origin.x)
  })

  it('picks a later EMS when equal-count leftover is a less-narrow channel', () => {
    const item = cargo({ quantity: 8 })
    const origin = { x: 0, y: 0, z: 0, length: 2000, width: 2000, height: 1000 }
    const later = { x: 3000, y: 0, z: 0, length: 4000, width: 1000, height: 1000 }
    const state = stateFor(item, [origin, later])

    const quantityPick = selectBlockCandidate(generateBlockCandidates(state, 'quantity'), 'quantity', state)
    expect(quantityPick).toBeDefined()
    expect(quantityPick!.block.count).toBe(4)
    expect(quantityPick!.ems.x).toBe(later.x)
    expect(quantityPick!.point.x).toBe(later.x)

    const volumePick = selectBlockCandidate(generateBlockCandidates(state, 'volume'), 'volume', state)
    expect(volumePick).toBeDefined()
    expect(volumePick!.block.count).toBe(4)
    expect(volumePick!.ems.x).toBe(later.x)
  })

  it('dedupes the same sku/orientation/nx/ny/nz/point once', () => {
    const item = cargo({ quantity: 4 })
    const ems = { x: 100, y: 200, z: 0, length: 2000, width: 2000, height: 1000 }
    const state = stateFor(item, [ems, { ...ems }])
    const candidates = generateBlockCandidates(state, 'quantity')
    const keys = candidates.map(candidateKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('applies truncation across EMS so a later high-rank space still appears', () => {
    const item = cargo({ quantity: 20 })
    const earlySmall = [
      { x: 0, y: 0, z: 0, length: 1000, width: 1000, height: 1000 },
      { x: 1000, y: 0, z: 0, length: 1000, width: 1000, height: 1000 },
      { x: 2000, y: 0, z: 0, length: 1000, width: 1000, height: 1000 },
      { x: 3000, y: 0, z: 0, length: 1000, width: 1000, height: 1000 },
    ]
    const laterBig = { x: 7000, y: 0, z: 0, length: 3000, width: 3000, height: 1000 }
    const state = stateFor(item, [...earlySmall, laterBig])

    const capped = generateBlockCandidates(state, 'quantity', { maxCandidates: 3 })
    expect(capped.length).toBeLessThanOrEqual(3)
    expect(capped.some((choice) => choice.ems.x === laterBig.x || choice.point.x === laterBig.x)).toBe(true)
    expect(Math.max(...capped.map((choice) => choice.block.count))).toBeGreaterThan(1)
  })
})
