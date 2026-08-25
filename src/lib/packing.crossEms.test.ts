import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { generateBlockCandidates, selectBlockCandidate } from './packingCandidates'
import { canStageBlock, MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import type { PackingSearchState } from './packingSearchState'
import { calculatePacking, shouldUseBlockEngine } from './packing'

function cube(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'cube',
    name: 'cube',
    label: 'C',
    length: 1000,
    width: 1000,
    height: 1000,
    weight: 8,
    quantity: 10,
    color: '#64748b',
    canRotate: false,
    stackable: true,
    ...overrides,
  }
}

function searchState(item: CargoItem, emsList: PackingSearchState['emsList']): PackingSearchState {
  return {
    container: {
      id: 'cross-ems',
      label: 'cross-ems',
      description: 'injected disjoint EMS',
      length: 8000,
      width: 4000,
      height: 4000,
      maxWeight: 50_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    },
    cargoStates: [{ item, itemIndex: 0, label: item.label ?? 'C', remaining: item.quantity, nextIndex: 1 }],
    emsList,
    placed: [],
    placedById: new Map(),
    usedWeight: 0,
    minSupportRatio: MINIMUM_SUPPORT_RATIO,
  }
}

/**
 * Production picker is selectBlockCandidate on the full candidate list.
 * Greedy ranking keeps the packing front unless leftover quality is better
 * among near-equal count/volume candidates from every EMS.
 */
describe('packing.ts cross-EMS selection', () => {
  it('does not let a later EMS win solely because its current block count is larger', () => {
    const item = cube({ quantity: 10 })
    const origin = { x: 0, y: 0, z: 0, length: 1000, width: 1000, height: 1000 }
    const later = { x: 5000, y: 0, z: 0, length: 2000, width: 2000, height: 1000 }
    const state = searchState(item, [origin, later])

    const picked = selectBlockCandidate(generateBlockCandidates(state, 'quantity'), 'quantity', state)
    expect(picked).toBeDefined()
    expect(picked!.ems.x, 'origin packing front must win against a far higher-count column').toBe(origin.x)
    expect(picked!.point.x).toBe(origin.x)
    expect(canStageBlock(state, picked!)).toBe(true)
  })

  it('selects a later EMS when equal-count leftover is a less-narrow channel', () => {
    const item = cube({ quantity: 8 })
    const origin = { x: 0, y: 0, z: 0, length: 2000, width: 2000, height: 1000 }
    const later = { x: 3000, y: 0, z: 0, length: 4000, width: 1000, height: 1000 }
    const state = searchState(item, [origin, later])

    const picked = selectBlockCandidate(generateBlockCandidates(state, 'quantity'), 'quantity', state)
    expect(picked).toBeDefined()
    expect(picked!.block.count).toBe(4)
    expect(picked!.ems.x, 'better leftover at equal count must surface a later EMS').toBe(later.x)
    expect(picked!.point.x).toBe(later.x)
    expect(canStageBlock(state, picked!)).toBe(true)
  })

  it('calculatePacking on a two-SKU block-engine load starts at the origin packing front', () => {
    const container: ContainerSpec = {
      id: 'front',
      label: 'front',
      description: 'block-engine load that must fill from x=0',
      length: 6000,
      width: 2000,
      height: 2000,
      maxWeight: 50_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }
    const items: CargoItem[] = [
      { id: 'a', name: 'A', label: 'A', length: 1000, width: 1000, height: 500, weight: 10, quantity: 50, color: '#f59e0b', canRotate: false, stackable: true },
      { id: 'b', name: 'B', label: 'B', length: 1000, width: 1000, height: 500, weight: 10, quantity: 50, color: '#0ea5e9', canRotate: false, stackable: true },
    ]
    expect(shouldUseBlockEngine(items, 'quantity', container)).toBe(true)

    const result = calculatePacking(container, items, { loadingMode: 'quantity' })
    const first = result.placed.find((box) => box.workStep === 1)
    expect(first).toBeDefined()
    expect(first!.x).toBe(0)
    expect(first!.y).toBe(0)
    expect(result.placedCount).toBeGreaterThan(0)
    expect(result.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([])
  })
})
