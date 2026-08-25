import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CargoItem, PlacementBox } from '../types'
import { bestBlocksForSpace } from './blocks'
import { generateBlockCandidates, type PackingBlockChoice } from './packingCandidates'
import { MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import type { PackingQuality } from './packingObjective'
import {
  DEFAULT_QUANTITY_SEARCH_BUDGET,
  optimisticCountBound,
  optimizePacking,
  type PackingSearchHooks,
} from './packingSearch'
import { clonePackingSearchState, type PackingSearchState } from './packingSearchState'

function cube(): CargoItem {
  return {
    id: 'cube',
    name: 'cube',
    label: 'C',
    length: 1000,
    width: 1000,
    height: 1000,
    weight: 8,
    quantity: 8,
    color: '#64748b',
    canRotate: false,
    stackable: false,
  }
}

function toyState(remaining = 8): PackingSearchState {
  const item = cube()
  return {
    container: {
      id: 'toy-5x1',
      label: 'toy',
      description: '4-unit greedy vs 5-unit alternative first block',
      length: 4000,
      width: 1000,
      height: 1000,
      maxWeight: 50_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    },
    cargoStates: [{ item, itemIndex: 0, label: 'C', remaining, nextIndex: 1 }],
    emsList: [{ x: 0, y: 0, z: 0, length: 4000, width: 1000, height: 1000 }],
    placed: [],
    placedById: new Map(),
    usedWeight: 0,
    minSupportRatio: MINIMUM_SUPPORT_RATIO,
  }
}

function dummyBox(overrides: Partial<PlacementBox> & Pick<PlacementBox, 'id' | 'index' | 'x'>): PlacementBox {
  return {
    cargoId: 'cube',
    name: 'cube',
    label: 'C',
    y: 0,
    z: 0,
    length: 1000,
    width: 1000,
    height: 1000,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: 8,
    color: '#64748b',
    canRotate: false,
    stackable: false,
    physicalLayer: 1,
    workStep: overrides.index,
    supportType: 'floor',
    supportedBy: [],
    ...overrides,
  }
}

function addBoxes(state: PackingSearchState, count: number) {
  const cargo = state.cargoStates[0]
  const start = state.placed.length
  for (let i = 0; i < count; i += 1) {
    const index = start + i + 1
    const box = dummyBox({ id: `cube-${index}`, index, x: i * 1000 })
    state.placed.push(box)
    state.placedById.set(box.id, box)
  }
  if (cargo) {
    cargo.remaining = Math.max(0, cargo.remaining - count)
    cargo.nextIndex += count
  }
  state.usedWeight += 8 * count
}

function qualityOf(state: PackingSearchState, notch: number): PackingQuality {
  return {
    placedCount: state.placed.length,
    usedVolume: state.placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0),
    internalNotchVolume: notch,
    interCargoMaxMm: 0,
    deadEmsVolume: 0,
    externalResidualVolume: 0,
  }
}

function commitChoice(state: PackingSearchState, choice: PackingBlockChoice): PackingSearchState {
  const next = clonePackingSearchState(state)
  const cargo = next.cargoStates.find((entry) => entry.item.id === choice.cargoId)
  if (!cargo || cargo.remaining < choice.block.count) return next
  cargo.remaining -= choice.block.count
  cargo.nextIndex += choice.block.count
  const start = next.placed.length
  for (let i = 0; i < choice.block.count; i += 1) {
    const index = start + i + 1
    const box = dummyBox({
      id: `${choice.cargoId}-${index}`,
      index,
      x: choice.point.x + i * choice.block.box.length,
      y: choice.point.y,
      z: choice.point.z,
      length: choice.block.box.length,
      width: choice.block.box.width,
      height: choice.block.box.height,
    })
    next.placed.push(box)
    next.placedById.set(box.id, box)
  }
  next.usedWeight += choice.block.weight
  const leftover = choice.ems.length - choice.block.length
  next.emsList = leftover > 0
    ? [{ ...choice.ems, x: choice.point.x + choice.block.length, length: leftover }]
    : []
  return next
}

describe('quantity beam search', () => {
  it('keeps the published quantity budget at width 8, depth 2, 32 states, 8s', () => {
    expect(DEFAULT_QUANTITY_SEARCH_BUDGET).toEqual({
      beamWidth: 8,
      depth: 2,
      maxStates: 32,
      maxMs: 8000,
    })
  })

  it('does not import packing.ts, so the searcher can be hooked from packing without a cycle', () => {
    const source = readFileSync(resolve('src/lib/packingSearch.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"]\.\/packing['"]/)
  })

  it('picks the first block that finishes at 5 pieces because quantity is final count, not greedy 4', () => {
    const initial = toyState()
    const generated = generateBlockCandidates(initial, 'quantity')
    expect(generated.some((choice) => choice.block.count === 4), 'greedy-sized first block must exist').toBe(true)
    expect(generated.some((choice) => choice.block.count === 3), 'alternative first block must exist').toBe(true)

    const notches = new WeakMap<object, number>()
    const hooks: PackingSearchHooks = {
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) {
          addBoxes(next, 4)
          notches.set(next, 0)
          return next
        }
        if (next.placed.length === 3) {
          addBoxes(next, 2)
          notches.set(next, 50)
          return next
        }
        notches.set(next, 0)
        return next
      },
      quality: (state) => qualityOf(state, notches.get(state) ?? 0),
    }

    const greedy = hooks.complete(clonePackingSearchState(initial))
    expect(greedy.placed.length, 'greedy complete is the 4-piece incumbent').toBe(4)

    const result = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks)
    expect(
      result.state.placed.length,
      'quantity must keep the 5-piece complete even though that first block is smaller and less compact',
    ).toBe(5)
    expect(result.search.strategy).toBe('beam')
    expect(hooks.quality(result.state).placedCount).toBe(5)
    expect(hooks.quality(greedy).placedCount).toBe(4)
  })

  it('breaks an equal final count with the smaller interior notch volume', () => {
    const initial = toyState()
    const notches = new WeakMap<object, number>()
    const hooks: PackingSearchHooks = {
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        const first = next.placed.length
        if (first === 0) {
          addBoxes(next, 5)
          notches.set(next, 80)
          return next
        }
        while (next.placed.length < 5) addBoxes(next, 1)
        notches.set(next, first === 3 ? 0 : 40)
        return next
      },
      quality: (state) => qualityOf(state, notches.get(state) ?? 0),
    }

    const result = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks)
    expect(result.state.placed.length).toBe(5)
    expect(
      hooks.quality(result.state).internalNotchVolume,
      'same count must prefer the 3-piece first block whose complete layout has no interior notch',
    ).toBe(0)
  })

  it('does not let a more compact 4-piece layout beat a 5-piece complete', () => {
    const initial = toyState()
    const notches = new WeakMap<object, number>()
    const hooks: PackingSearchHooks = {
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) {
          addBoxes(next, 5)
          notches.set(next, 100)
          return next
        }
        if (next.placed.length === 4) {
          notches.set(next, 0)
          return next
        }
        while (next.placed.length < 5) addBoxes(next, 1)
        notches.set(next, 50)
        return next
      },
      quality: (state) => qualityOf(state, notches.get(state) ?? 0),
    }

    const result = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks)
    expect(result.state.placed.length).toBe(5)
    expect(hooks.quality(result.state).internalNotchVolume).toBeGreaterThan(0)
  })

  it('returns the greedy complete and budgetExceeded when the beam cannot expand', () => {
    const initial = toyState()
    const hooks: PackingSearchHooks = {
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) addBoxes(next, 4)
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const zeroStates = optimizePacking(initial, { beamWidth: 8, depth: 2, maxStates: 0, maxMs: 8000 }, hooks)
    expect(zeroStates.state.placed.length).toBeGreaterThan(0)
    expect(zeroStates.state.placed.length).toBe(4)
    expect(zeroStates.search.budgetExceeded).toBe(true)
    expect(zeroStates.search.strategy).toBe('greedy')

    const zeroMs = optimizePacking(initial, { beamWidth: 8, depth: 2, maxStates: 32, maxMs: 0 }, hooks)
    expect(zeroMs.state.placed.length).toBeGreaterThan(0)
    expect(zeroMs.search.budgetExceeded).toBe(true)
  })

  it('optimistic count bound is at least leftover size-fit remaining and must not underestimate', () => {
    const item: CargoItem = {
      id: 'fit',
      name: 'fit',
      label: 'F',
      length: 500,
      width: 500,
      height: 500,
      weight: 1,
      quantity: 8,
      color: '#0f172a',
      canRotate: false,
      stackable: true,
    }
    const leftover = { x: 0, y: 0, z: 0, length: 2000, width: 1000, height: 500 }
    const geometric = bestBlocksForSpace(item, 8, leftover)
    const sizeFit = Math.max(0, ...geometric.map((block) => block.count))
    expect(sizeFit, 'constructed leftover must size-fit several cubes').toBeGreaterThanOrEqual(8)

    const state: PackingSearchState = {
      container: {
        id: 'bound',
        label: 'bound',
        description: 'bound',
        length: 2000,
        width: 1000,
        height: 500,
        maxWeight: 10_000,
        doorGap: 0,
        topGap: 0,
        sideGap: 0,
      },
      cargoStates: [{ item, itemIndex: 0, label: 'F', remaining: 8, nextIndex: 1 }],
      emsList: [leftover],
      placed: [],
      placedById: new Map(),
      usedWeight: 0,
      minSupportRatio: MINIMUM_SUPPORT_RATIO,
    }

    const bound = optimisticCountBound(state)
    expect(bound).toBeGreaterThanOrEqual(state.placed.length + sizeFit)
    expect(bound).toBeGreaterThanOrEqual(state.placed.length + 8)

    const underestimated = state.placed.length + 0
    expect(underestimated, 'a proven-zero leftover bound would hide placeable remaining').toBeLessThan(sizeFit)
    expect(bound).toBeGreaterThan(underestimated)
  })

  it('mutating clone A placed/emsList does not change clone B', () => {
    const original = toyState()
    addBoxes(original, 1)
    const a = clonePackingSearchState(original)
    const b = clonePackingSearchState(original)

    a.placed.push(dummyBox({ id: 'cube-a', index: 99, x: 3000 }))
    a.placed[0].x = 42
    a.emsList[0].x = 7
    a.emsList.push({ x: 0, y: 0, z: 500, length: 500, width: 500, height: 500 })

    expect(b.placed).toHaveLength(1)
    expect(b.placed[0].x).toBe(0)
    expect(b.emsList).toHaveLength(1)
    expect(b.emsList[0].x).toBe(0)
    expect(original.placed).toHaveLength(1)
    expect(original.placed[0].x).toBe(0)
    expect(original.emsList[0].x).toBe(0)
  })
})
