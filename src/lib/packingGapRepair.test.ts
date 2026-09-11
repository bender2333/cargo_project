import { describe, expect, it, vi } from 'vitest'
import type { CargoItem, PlacementBox } from '../types'
import { initEMS, splitEMS } from './emsSpace'
import { reopenGapLayer, repairQuantityPackingGap } from './packingGapRepair'
import { packingQualityOf } from './packingObjective'
import type { PackingSearchHooks } from './packingSearch'
import { clonePackingSearchState, type PackingSearchState } from './packingSearchState'

const container = {
  id: 'upper-slot', label: 'Upper slot', description: '', length: 600, width: 200, height: 300,
  maxWeight: 100, doorGap: 0, topGap: 0, sideGap: 0,
}
const top: CargoItem = {
  id: 'top', name: 'Carton', label: 'T', color: '#ffffff',
  length: 100, width: 200, height: 100, quantity: 8, weight: 2,
  canRotate: false, stackable: true,
}
const base: CargoItem = { ...top, id: 'base', name: 'Base', label: 'B', length: 600, quantity: 1 }

function box(item: CargoItem, index: number, x: number, z: number): PlacementBox {
  return {
    ...item, label: item.label ?? item.name, id: `${item.id}-${index}`, cargoId: item.id, index, x, y: 0, z,
    orientationKey: 'LWH', labelRotationDeg: 0, workStep: index + 1,
    supportedBy: z === 0 ? [] : ['base-1'],
    physicalLayer: z === 0 ? 1 : 2,
    supportType: z === 0 ? 'floor' : 'fully-supported',
  }
}

function layout(xs = [0, 400]): PackingSearchState {
  const placed = [box(base, 1, 0, 0), ...xs.map((x, i) => box(top, i + 1, x, 100))]
  return {
    container, placed, placedById: new Map(placed.map((b) => [b.id, b])),
    emsList: placed.reduce((ems, b) => splitEMS(ems, b), initEMS(container)),
    usedWeight: placed.reduce((sum, b) => sum + b.weight, 0), minSupportRatio: 1,
    cargoStates: [
      { item: base, itemIndex: 0, label: base.label!, remaining: 0, nextIndex: 2 },
      { item: top, itemIndex: 1, label: top.label!, remaining: top.quantity - xs.length, nextIndex: xs.length + 1 },
    ],
  }
}

describe('quantity upper-gap repair', () => {
  it('reopens only the upper load and rebuilds demand, weight, free spaces, and the support index', () => {
    const complete = layout()
    const before = clonePackingSearchState(complete)
    const reopened = reopenGapLayer(complete)!
    expect(reopened.placed.map((b) => b.id)).toEqual(['base-1'])
    expect(reopened.usedWeight).toBe(base.weight)
    expect(reopened.cargoStates.map((cargo) => cargo.remaining)).toEqual([0, top.quantity])
    expect(reopened.cargoStates[1].nextIndex).toBe(3)
    expect([...reopened.placedById.keys()]).toEqual(['base-1'])
    expect(reopened.emsList.some((ems) => ems.z === 100 && ems.length === 600)).toBe(true)
    expect(reopened.emsList.every((ems) => ems.z >= 100)).toBe(true)
    expect(complete).toEqual(before)
  })

  it('removes riders as well as intersecting supports, never leaving a floating retained box', () => {
    const complete = layout()
    const rider = { ...box(top, 3, 0, 200), supportedBy: ['top-1'], physicalLayer: 3 }
    complete.placed.push(rider)
    complete.placedById.set(rider.id, rider)
    complete.cargoStates[1].remaining -= 1
    complete.cargoStates[1].nextIndex = 4
    const reopened = reopenGapLayer(complete)!
    expect(reopened.placed.map((b) => b.id)).toEqual(['base-1'])
    expect(reopened.cargoStates[1].remaining).toBe(top.quantity)
    expect(reopened.cargoStates[1].nextIndex).toBe(4)
  })

  it('keeps the original complete result when closing the gap would discard cartons', () => {
    const complete = layout()
    const hooks: PackingSearchHooks = {
      commit: (state) => state,
      complete: vi.fn(() => layout([0])),
      quality: packingQualityOf,
    }
    const repaired = repairQuantityPackingGap(complete, hooks)
    expect(repaired.completions).toBeGreaterThan(0)
    expect(repaired.completions).toBeLessThanOrEqual(4)
    expect(repaired.state).toBe(complete)
  })

  it('accepts a complete compact layout while preserving labels, count, and its lower support', () => {
    const complete = layout()
    const compact = layout([0, 100])
    const hooks: PackingSearchHooks = {
      commit: (state) => state,
      complete: () => compact,
      quality: packingQualityOf,
    }
    const repaired = repairQuantityPackingGap(complete, hooks)
    expect(repaired.state).toBe(compact)
    expect(repaired.state.placed.map((b) => b.label)).toEqual(['B', 'T', 'T'])
    expect(packingQualityOf(repaired.state).interCargoMaxMm).toBe(0)
    expect(repaired.state.placed[0]).toEqual(complete.placed[0])
    expect(complete.placed[2].x).toBe(400)
  })

  it('does not invoke candidate completion for a full load or a floor-level slot', () => {
    const full = layout()
    for (const cargo of full.cargoStates) cargo.remaining = 0
    const hooks: PackingSearchHooks = { commit: vi.fn(), complete: vi.fn(), quality: packingQualityOf }
    expect(repairQuantityPackingGap(full, hooks).state).toBe(full)
    const floor = layout()
    floor.placed = floor.placed.slice(1).map((b) => ({ ...b, z: 0, supportedBy: [] }))
    expect(reopenGapLayer(floor)).toBeNull()
    expect(hooks.complete).not.toHaveBeenCalled()
  })
})
