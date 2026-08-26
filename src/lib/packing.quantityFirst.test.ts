import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { containers } from '../data/containers'
import type { CargoItem, ContainerSpec } from '../types'
import { calculatePacking, lastPackingSearchStats, shouldUseBlockEngine } from './packing'
import { canPlaceBox, canStageBlock, MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import type { PackingBlockChoice } from './packingCandidates'
import type { PackingCargoState, PackingSearchState } from './packingSearchState'

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'sku-a',
    name: 'Box',
    label: 'A',
    length: 1000,
    width: 1000,
    height: 500,
    weight: 10,
    quantity: 4,
    color: '#64748b',
    canRotate: false,
    stackable: true,
    ...overrides,
  }
}

function container(overrides: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: 'test',
    label: 'test',
    description: 'quantity-first fixture',
    length: 4000,
    width: 2000,
    height: 2000,
    maxWeight: 10_000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
    ...overrides,
  }
}

function gp20(): ContainerSpec {
  const found = containers.find((item) => item.id === '20gp')
  if (!found) throw new Error('missing 20gp')
  return found
}

function cargoState(item: CargoItem, remaining = item.quantity): PackingCargoState {
  return {
    item,
    itemIndex: 0,
    label: item.label ?? 'A',
    remaining,
    nextIndex: 1,
  }
}

function searchState(overrides: Partial<PackingSearchState> = {}): PackingSearchState {
  const item = cargo()
  const placed = overrides.placed ?? []
  const placedById = overrides.placedById ?? new Map(placed.map((entry) => [entry.id, entry]))
  return {
    container: container(),
    cargoStates: [cargoState(item)],
    emsList: [{ x: 0, y: 0, z: 0, length: 4000, width: 2000, height: 2000 }],
    usedWeight: 0,
    minSupportRatio: MINIMUM_SUPPORT_RATIO,
    ...overrides,
    placed,
    placedById,
  }
}

describe('quantity-first production path', () => {
  it('does not hard-code 504 as a quantity algorithm ceiling', () => {
    const packingSource = readFileSync(resolve('src/lib/packing.ts'), 'utf8')
    const searchSource = readFileSync(resolve('src/lib/packingSearch.ts'), 'utf8')
    expect(packingSource).not.toMatch(/\b504\b/)
    expect(searchSource).not.toMatch(/\b504\b/)
    expect(packingSource).not.toMatch(/placedCount\s*>=\s*500/)
    expect(searchSource).not.toMatch(/placedCount\s*>=\s*500/)
  })

  it('does not keep a quantity slot hard cap or capped-complete overlay', () => {
    const packingSource = readFileSync(resolve('src/lib/packing.ts'), 'utf8')
    const searchSource = readFileSync(resolve('src/lib/packingSearch.ts'), 'utf8')
    expect(packingSource).not.toMatch(/passesQuantityHardCaps/)
    expect(packingSource).not.toMatch(/pickBestCappedComplete/)
    expect(searchSource).not.toMatch(/function pickBestCappedComplete/)
    expect(searchSource).not.toMatch(/passesQuantityHardCaps/)
  })

  it('does not import lookahead size-fit as a legality proof in packing.ts', () => {
    const packingSource = readFileSync(resolve('src/lib/packing.ts'), 'utf8')
    expect(packingSource).not.toMatch(/scoreRemainingEmsQuality/)
    expect(packingSource).not.toMatch(/nextCountBound/)
  })

  it('cross-EMS generation still walks every EMS instead of returning on the first space', () => {
    const source = readFileSync(resolve('src/lib/packingCandidates.ts'), 'utf8')
    expect(source).toMatch(/for \(const ems of spaces\)/)
    const generateBody = source.slice(source.indexOf('export function generateBlockCandidates'))
    const loopIndex = generateBody.indexOf('for (const ems of spaces)')
    const returnBeforeLoopEnd = generateBody.slice(loopIndex, generateBody.indexOf('\n  if (options'))
    expect(returnBeforeLoopEnd).not.toMatch(/return choices/)
  })

  it('documents lastPackingSearchStats as a single-thread diagnostic seam', () => {
    const packingSource = readFileSync(resolve('src/lib/packing.ts'), 'utf8')
    expect(packingSource).toMatch(/Not concurrency-safe/)
    expect(packingSource).toMatch(/Test \/ benchmark diagnostic seam only/)
  })

  it('publishes search stats after calculatePacking instead of dropping them', () => {
    const items: CargoItem[] = [
      cargo({ id: 'A', length: 400, width: 300, height: 400, quantity: 50, canRotate: true, stackable: true, weight: 8 }),
      cargo({ id: 'B', length: 530, width: 365, height: 310, quantity: 80, canRotate: true, stackable: true, weight: 8 }),
    ]
    const box = gp20()
    expect(shouldUseBlockEngine(items, 'quantity', box)).toBe(true)

    const result = calculatePacking(box, items, { loadingMode: 'quantity' })
    const stats = lastPackingSearchStats()
    expect(stats, 'calculatePacking must keep search telemetry').not.toBeNull()
    expect(stats?.claim).toBe('best-found-within-budget')
    expect(stats?.statesExpanded).toBeGreaterThanOrEqual(0)
    expect(stats?.candidatesEvaluated).toBeGreaterThanOrEqual(0)
    expect(typeof stats?.budgetExceeded).toBe('boolean')
    expect(stats?.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(result).not.toHaveProperty('search')
    expect(result).not.toHaveProperty('statesExpanded')
    expect(result).not.toHaveProperty('budgetExceeded')
  })

  it('does not put LNS or the exact solver on the default calculatePacking path', () => {
    const packingSource = readFileSync(resolve('src/lib/packing.ts'), 'utf8')
    expect(packingSource).not.toMatch(/packingSlotRelocation/)
    expect(packingSource).not.toMatch(/packingOracle/)
    expect(packingSource).not.toMatch(/relocateLargestBoundarySlot/)
    expect(packingSource).not.toMatch(/solvePackingOracle/)
  })
})

describe('400mm boundary-connected slots are not feasibility failures', () => {
  it('still places two floor boxes that leave a 400mm external gap', () => {
    const item = cargo({ id: 'pair', length: 1000, width: 1000, height: 500, quantity: 2 })
    const first = {
      id: 'pair-1',
      cargoId: 'pair',
      name: 'Box',
      label: 'A',
      index: 1,
      x: 0,
      y: 0,
      z: 0,
      length: 1000,
      width: 1000,
      height: 500,
      orientationKey: 'LWH' as const,
      labelRotationDeg: 0 as const,
      weight: 10,
      color: '#64748b',
      canRotate: false,
      stackable: true,
      physicalLayer: 1,
      workStep: 1,
      supportType: 'floor' as const,
      supportedBy: [],
    }
    const point = { x: 1400, y: 0, z: 0 }
    const box = { length: 1000, width: 1000, height: 500 }

    expect(canPlaceBox(point, box, container(), [first], new Map([[first.id, first]]), item)).toBe(true)

    const state = searchState({
      cargoStates: [cargoState(item, 1)],
      placed: [first],
      placedById: new Map([[first.id, first]]),
    })
    const choice: PackingBlockChoice = {
      cargoId: item.id,
      state: state.cargoStates[0],
      ems: { x: 1400, y: 0, z: 0, length: 2600, width: 2000, height: 2000 },
      point,
      waste: 0,
      block: {
        cargoId: item.id,
        name: item.name,
        label: item.label ?? 'A',
        color: item.color,
        orientationKey: 'LWH',
        box: { orientationKey: 'LWH', length: 1000, width: 1000, height: 500 },
        nx: 1,
        ny: 1,
        nz: 1,
        count: 1,
        length: 1000,
        width: 1000,
        height: 500,
        volume: 1000 * 1000 * 500,
        footprintArea: 1000 * 1000,
        weight: 10,
      },
    }
    expect(canStageBlock(state, choice)).toBe(true)
  })

  it('still rejects out of bounds, overlap, payload, support, groundOnly, and max stack', () => {
    const item = cargo({ id: 'hard', length: 1000, width: 1000, height: 500 })
    const box = { length: 1000, width: 1000, height: 500 }
    const emptyById = new Map()

    expect(canPlaceBox({ x: 3500, y: 0, z: 0 }, box, container(), [], emptyById, item), 'out of bounds').toBe(false)

    const occupant = {
      id: 'occ-1',
      cargoId: 'occ',
      name: 'Occ',
      label: 'O',
      index: 1,
      x: 0,
      y: 0,
      z: 0,
      length: 1000,
      width: 1000,
      height: 500,
      orientationKey: 'LWH' as const,
      labelRotationDeg: 0 as const,
      weight: 1,
      color: '#94a3b8',
      canRotate: false,
      stackable: true,
      maxStackLayers: 1,
      physicalLayer: 1,
      workStep: 1,
      supportType: 'floor' as const,
      supportedBy: [],
    }
    expect(canPlaceBox({ x: 0, y: 0, z: 0 }, box, container(), [occupant], new Map([[occupant.id, occupant]]), item), 'overlap').toBe(false)
    expect(canPlaceBox({ x: 0, y: 0, z: 500 }, box, container(), [occupant], new Map([[occupant.id, occupant]]), item), 'max stack').toBe(false)

    const groundOnly = cargo({ id: 'ground', groundOnly: true, height: 500 })
    const supportBase = { ...occupant, id: 'floor-1', maxStackLayers: 99, stackable: true }
    expect(canPlaceBox({ x: 0, y: 0, z: 500 }, box, container(), [supportBase], new Map([[supportBase.id, supportBase]]), groundOnly), 'groundOnly').toBe(false)

    const short = { ...occupant, id: 'short-1', length: 400, maxStackLayers: 99 }
    expect(canPlaceBox({ x: 0, y: 0, z: 500 }, box, container(), [short], new Map([[short.id, short]]), item), 'support ratio').toBe(false)

    const heavy = cargo({ id: 'heavy', weight: 40, quantity: 4 })
    const heavyState = searchState({
      container: container({ maxWeight: 100 }),
      usedWeight: 90,
      cargoStates: [cargoState(heavy, 4)],
    })
    const heavyChoice: PackingBlockChoice = {
      cargoId: heavy.id,
      state: heavyState.cargoStates[0],
      ems: { x: 0, y: 0, z: 0, length: 4000, width: 2000, height: 2000 },
      point: { x: 0, y: 0, z: 0 },
      waste: 0,
      block: {
        cargoId: heavy.id,
        name: heavy.name,
        label: heavy.label ?? 'A',
        color: heavy.color,
        orientationKey: 'LWH',
        box: { orientationKey: 'LWH', length: 1000, width: 1000, height: 500 },
        nx: 2,
        ny: 1,
        nz: 1,
        count: 2,
        length: 2000,
        width: 1000,
        height: 500,
        volume: 2 * 1000 * 1000 * 500,
        footprintArea: 2000 * 1000,
        weight: 80,
      },
    }
    expect(canStageBlock(heavyState, heavyChoice), 'payload').toBe(false)
  })
})
