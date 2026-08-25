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
  it('picks the later EMS when it holds a higher quantity block', () => {
    const item = cargo({ quantity: 10 })
    const early = { x: 0, y: 0, z: 0, length: 1000, width: 1000, height: 1000 }
    const later = { x: 3000, y: 0, z: 0, length: 2000, width: 2000, height: 1000 }
    const state = stateFor(item, [early, later])

    const candidates = generateBlockCandidates(state, 'quantity')
    expect(candidates.some((choice) => choice.point.x === early.x)).toBe(true)
    expect(candidates.some((choice) => choice.point.x === later.x)).toBe(true)

    const picked = selectBlockCandidate(candidates, 'quantity', state)
    expect(picked).toBeDefined()
    expect(picked!.point.x).toBe(later.x)
    expect(picked!.ems.x).toBe(later.x)
    expect(picked!.block.count).toBeGreaterThan(1)
  })

  it('picks the later EMS when it holds a higher volume block', () => {
    const item = cargo({ quantity: 10 })
    const early = { x: 0, y: 0, z: 0, length: 1000, width: 1000, height: 1000 }
    const later = { x: 4000, y: 0, z: 0, length: 2000, width: 2000, height: 1000 }
    const state = stateFor(item, [early, later])

    const picked = selectBlockCandidate(generateBlockCandidates(state, 'volume'), 'volume', state)
    expect(picked).toBeDefined()
    expect(picked!.point.x).toBe(later.x)
    expect(picked!.ems.x).toBe(later.x)
    expect(picked!.block.volume).toBeGreaterThan(1_000_000_000)
  })

  it('lets a later EMS win when the first space has a larger current footprint but a worse count', () => {
    const item = cargo({ quantity: 10 })
    // First EMS is a long 3-unit floor strip (larger current XY block, count 3).
    // Later EMS is a 4-high column (better quantity/volume). Old first-EMS return would commit the strip.
    const early = { x: 0, y: 0, z: 0, length: 3000, width: 1000, height: 1000 }
    const later = { x: 5000, y: 0, z: 0, length: 1000, width: 1000, height: 4000 }
    const state = stateFor(item, [early, later])

    const quantityPick = selectBlockCandidate(generateBlockCandidates(state, 'quantity'), 'quantity', state)
    expect(quantityPick).toBeDefined()
    expect(quantityPick!.ems.x).toBe(later.x)
    expect(quantityPick!.point.x).toBe(later.x)
    expect(quantityPick!.block.count).toBe(4)

    const volumePick = selectBlockCandidate(generateBlockCandidates(state, 'volume'), 'volume', state)
    expect(volumePick).toBeDefined()
    expect(volumePick!.ems.x).toBe(later.x)
    expect(volumePick!.block.count).toBe(4)
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
