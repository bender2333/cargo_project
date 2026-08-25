import { describe, expect, it } from 'vitest'
import type { CargoItem } from '../types'
import { generateBlockCandidates, selectBlockCandidate } from './packingCandidates'
import { canStageBlock, MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import type { PackingSearchState } from './packingSearchState'

/**
 * Production picker proof: packing.ts now calls generateBlockCandidates + selectBlockCandidate
 * instead of returning at the first x-sorted EMS that has any feasible block.
 */
describe('packing.ts cross-EMS selection', () => {
  it('does not hide a better later EMS behind the first x-sorted feasible space', () => {
    const item: CargoItem = {
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
    }
    const trap = { x: 0, y: 0, z: 0, length: 3000, width: 1000, height: 1000 }
    const later = { x: 5000, y: 0, z: 0, length: 1000, width: 1000, height: 4000 }
    const state: PackingSearchState = {
      container: {
        id: 'cross-ems',
        label: 'cross-ems',
        description: 'first EMS is a 3-unit strip trap',
        length: 8000,
        width: 4000,
        height: 4000,
        maxWeight: 50_000,
        doorGap: 0,
        topGap: 0,
        sideGap: 0,
      },
      cargoStates: [{ item, itemIndex: 0, label: 'C', remaining: 10, nextIndex: 1 }],
      emsList: [trap, later],
      placed: [],
      placedById: new Map(),
      usedWeight: 0,
      minSupportRatio: MINIMUM_SUPPORT_RATIO,
    }

    const picked = selectBlockCandidate(generateBlockCandidates(state, 'quantity'), 'quantity', state)
    expect(picked).toBeDefined()
    expect(picked!.ems.x, 'global picker must take the later column, not the first-EMS strip').toBe(later.x)
    expect(picked!.point.x).toBe(later.x)
    expect(picked!.block.count).toBe(4)
    expect(canStageBlock(state, picked!)).toBe(true)
  })
})
