import { describe, expect, it } from 'vitest'
import type { CargoItem, PlacementBox } from '../types'
import { MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import { clonePackingSearchState, type PackingSearchState } from './packingSearchState'

function item(): CargoItem {
  return {
    id: 'sku',
    name: 'sku',
    label: 'S',
    length: 500,
    width: 400,
    height: 300,
    weight: 7,
    quantity: 3,
    color: '#0f172a',
    canRotate: true,
    stackable: true,
  }
}

function box(): PlacementBox {
  return {
    id: 'sku-1',
    cargoId: 'sku',
    name: 'sku',
    label: 'S',
    index: 1,
    x: 0,
    y: 0,
    z: 0,
    length: 500,
    width: 400,
    height: 300,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: 7,
    color: '#0f172a',
    canRotate: true,
    stackable: true,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
  }
}

function makeState(): PackingSearchState {
  const placed = [box()]
  return {
    container: {
      id: 'c',
      label: 'c',
      description: 'c',
      length: 6000,
      width: 2400,
      height: 2400,
      maxWeight: 20_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    },
    cargoStates: [{ item: item(), itemIndex: 0, label: 'S', remaining: 2, nextIndex: 2 }],
    emsList: [{ x: 500, y: 0, z: 0, length: 5500, width: 2400, height: 2400 }],
    placed,
    placedById: new Map([[placed[0].id, placed[0]]]),
    usedWeight: 7,
    minSupportRatio: MINIMUM_SUPPORT_RATIO,
  }
}

describe('clonePackingSearchState', () => {
  it('does not share placed[], emsList[], or placedById Map references with the original', () => {
    const original = makeState()
    const clone = clonePackingSearchState(original)

    expect(clone.placed).not.toBe(original.placed)
    expect(clone.emsList).not.toBe(original.emsList)
    expect(clone.placedById).not.toBe(original.placedById)

    clone.placed.push({ ...box(), id: 'sku-2', index: 2, x: 500 })
    clone.emsList.push({ x: 0, y: 0, z: 300, length: 500, width: 400, height: 2100 })
    clone.placedById.set('sku-2', clone.placed[1])
    clone.placed[0].x = 999
    clone.emsList[0].x = 42
    clone.cargoStates[0].remaining = 0

    expect(original.placed).toHaveLength(1)
    expect(original.emsList).toHaveLength(1)
    expect(original.placedById.has('sku-2')).toBe(false)
    expect(original.placed[0].x).toBe(0)
    expect(original.emsList[0].x).toBe(500)
    expect(original.cargoStates[0].remaining).toBe(2)
  })
})
