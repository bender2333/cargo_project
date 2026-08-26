import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CargoItem, PlacementBox } from '../types'
import { bestBlocksForSpace } from './blocks'
import { splitEMS } from './emsSpace'
import { generateBlockCandidates, type PackingBlockChoice } from './packingCandidates'
import { canStageBlock, MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import { comparePackingQuality, type PackingQuality } from './packingObjective'
import {
  DEFAULT_QUANTITY_SEARCH_BUDGET,
  optimisticCountBound,
  optimisticVolumeBound,
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
    unsupportedSpanRisk: 0,
    interCargoMaxMm: 0,
    deadEmsVolume: 0,
    externalResidualVolume: 0,
    placementTieBreak: '',
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
  it('keeps the published quantity budget at width 8, 32 states, 8s, without a hardcoded depth of 2', () => {
    expect(DEFAULT_QUANTITY_SEARCH_BUDGET.beamWidth).toBe(8)
    expect(DEFAULT_QUANTITY_SEARCH_BUDGET.maxStates).toBe(32)
    expect(DEFAULT_QUANTITY_SEARCH_BUDGET.maxMs).toBe(8000)
    expect(DEFAULT_QUANTITY_SEARCH_BUDGET.maxDepth).toBeUndefined()
    expect(DEFAULT_QUANTITY_SEARCH_BUDGET).not.toHaveProperty('depth')
  })

  it('does not import packing.ts, so the searcher can be hooked from packing without a cycle', () => {
    const source = readFileSync(resolve('src/lib/packingSearch.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"]\.\/packing['"]/)
  })

  it('keeps a feasible 6-piece complete with a 400mm boundary slot over 5 and 4', () => {
    const greedy = toyState()
    addBoxes(greedy, 4)
    const wideSlot = toyState()
    addBoxes(wideSlot, 6)
    const mid = toyState()
    addBoxes(mid, 5)
    const slotMm = new WeakMap<object, number>([
      [greedy, 0],
      [wideSlot, 400],
      [mid, 180],
    ])
    const quality = (state: PackingSearchState): PackingQuality => ({
      ...qualityOf(state, 0),
      interCargoMaxMm: slotMm.get(state) ?? 0,
    })

    const ranked = [greedy, wideSlot, mid].sort((a, b) => (
      comparePackingQuality(quality(a), quality(b), 'quantity')
    ))
    expect(ranked[0].placed.length, 'quantity must keep the higher feasible count even with a 400mm slot').toBe(6)
    expect(quality(ranked[0]).interCargoMaxMm).toBe(400)
    expect(ranked[0]).toBe(wideSlot)
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

    const result = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks, 'quantity')
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

    const result = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks, 'quantity')
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

    const result = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks, 'quantity')
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

    const zeroStates = optimizePacking(initial, { beamWidth: 8, maxStates: 0, maxMs: 8000 }, hooks, 'quantity')
    expect(zeroStates.state.placed.length).toBeGreaterThan(0)
    expect(zeroStates.state.placed.length).toBe(4)
    expect(zeroStates.search.budgetExceeded).toBe(true)
    expect(zeroStates.search.strategy).toBe('greedy')
    expect(zeroStates.search.claim).toBe('best-found-within-budget')

    const zeroMs = optimizePacking(initial, { beamWidth: 8, maxStates: 32, maxMs: 0 }, hooks, 'quantity')
    expect(zeroMs.state.placed.length).toBeGreaterThan(0)
    expect(zeroMs.search.budgetExceeded).toBe(true)
  })

  it('optimistic count bound uses leftover geometry so placed+remainingQty without geometry fails when leftover is tighter', () => {
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
    const leftover = { x: 0, y: 0, z: 0, length: 1500, width: 500, height: 500 }
    const geometric = bestBlocksForSpace(item, 8, leftover)
    const sizeFit = Math.max(0, ...geometric.map((block) => block.count))
    expect(sizeFit, 'constructed leftover must size-fit some but not all remaining cubes').toBeGreaterThan(0)
    expect(sizeFit).toBeLessThan(8)

    const state: PackingSearchState = {
      container: {
        id: 'bound',
        label: 'bound',
        description: 'bound',
        length: 1500,
        width: 500,
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
    const remainingQty = 8
    expect(bound).toBeGreaterThanOrEqual(state.placed.length + sizeFit)
    expect(
      bound,
      'bound must follow leftover EMS capacity, not remaining demand alone',
    ).toBeLessThan(state.placed.length + remainingQty)

    const demandOnly = state.placed.length + remainingQty
    expect(demandOnly, 'placed+remainingQty ignores tighter leftover geometry').toBeGreaterThan(bound)
  })

  it('still finds a better depth-2 complete when first-block candidates exceed maxStates', () => {
    const item = cube()
    const emsList = Array.from({ length: 10 }, (_, index) => ({
      x: index * 1000,
      y: 0,
      z: 0,
      length: 1000,
      width: 1000,
      height: 1000,
    }))
    const initial: PackingSearchState = {
      container: {
        id: 'many-ems',
        label: 'many-ems',
        description: 'more first-block candidates than maxStates',
        length: 10000,
        width: 1000,
        height: 1000,
        maxWeight: 50_000,
        doorGap: 0,
        topGap: 0,
        sideGap: 0,
      },
      cargoStates: [{ item, itemIndex: 0, label: 'C', remaining: 8, nextIndex: 1 }],
      emsList,
      placed: [],
      placedById: new Map(),
      usedWeight: 0,
      minSupportRatio: MINIMUM_SUPPORT_RATIO,
    }

    const generated = generateBlockCandidates(initial, 'quantity')
    expect(generated.length).toBeGreaterThan(3)

    const commitAcrossEms = (state: PackingSearchState, choice: PackingBlockChoice) => {
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
        })
        next.placed.push(box)
        next.placedById.set(box.id, box)
      }
      next.usedWeight += choice.block.weight
      next.emsList = splitEMS(next.emsList, {
        x: choice.point.x,
        y: choice.point.y,
        z: choice.point.z,
        length: choice.block.length,
        width: choice.block.width,
        height: choice.block.height,
      })
      return next
    }

    const hooks: PackingSearchHooks = {
      commit: commitAcrossEms,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) {
          addBoxes(next, 4)
          return next
        }
        const target = next.placed.length >= 2 ? 5 : 4
        while (next.placed.length < target) addBoxes(next, 1)
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const greedy = hooks.complete(clonePackingSearchState(initial))
    expect(greedy.placed.length).toBe(4)

    const result = optimizePacking(initial, { beamWidth: 2, maxDepth: 2, maxStates: 3, maxMs: 8000 }, hooks, 'quantity')
    expect(
      result.state.placed.length,
      'ranking first-block candidates before committing must leave maxStates for a depth-2 5-piece complete',
    ).toBe(5)
    expect(result.search.strategy).toBe('beam')
    expect(result.search.statesExpanded).toBeLessThanOrEqual(3)
  })

  it('does not let an illegal high-bound first block occupy a width-1 beam', () => {
    const initial = toyState()
    const stagedCounts: number[] = []
    const committedCounts: number[] = []
    const hooks: PackingSearchHooks = {
      canStage: (_state, choice) => {
        stagedCounts.push(choice.block.count)
        return choice.block.count < 4
      },
      commit: (state, choice) => {
        committedCounts.push(choice.block.count)
        expect(choice.block.count, 'illegal high-bound blocks must not be committed').toBeLessThan(4)
        return commitChoice(state, choice)
      },
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) {
          addBoxes(next, 4)
          return next
        }
        if (next.placed.length === 3) addBoxes(next, 2)
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const result = optimizePacking(initial, { beamWidth: 1, maxDepth: 2, maxStates: 8, maxMs: 8000 }, hooks, 'quantity')
    expect(stagedCounts.some((count) => count >= 4), 'the illegal high-bound 4-pack must still be generated').toBe(true)
    expect(committedCounts.length).toBeGreaterThan(0)
    expect(committedCounts.every((count) => count < 4)).toBe(true)
    expect(result.state.placed.length, 'the legal 3-pack must still complete to 5 inside a width-1 beam').toBe(5)
  })

  it('runs canStage on every generated block before any commit, including each unit of a multi-box block', () => {
    const initial = toyState()
    const stagedUnits: number[] = []
    const hooks: PackingSearchHooks = {
      canStage: (state, choice) => {
        stagedUnits.push(choice.block.count)
        expect(choice.block.nx * choice.block.ny * choice.block.nz).toBe(choice.block.count)
        return canStageBlock(state, choice)
      },
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) addBoxes(next, 4)
        else while (next.placed.length < 5) addBoxes(next, 1)
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    optimizePacking(initial, { beamWidth: 2, maxDepth: 1, maxStates: 8, maxMs: 8000 }, hooks, 'quantity')
    expect(stagedUnits.length, 'every generated block must be staged before ranking').toBeGreaterThan(0)
    expect(stagedUnits.some((count) => count > 1), 'a multi-box block must stage every unit via canStage/canPlaceBox').toBe(true)
  })

  it('clones before commit so expanding one beam child cannot mutate a sibling', () => {
    const initial = toyState()
    const snapshots: number[] = []
    const hooks: PackingSearchHooks = {
      commit: (state, choice) => {
        snapshots.push(state.placed.length)
        const next = commitChoice(state, choice)
        state.placed.push(dummyBox({ id: `pollute-${state.placed.length}`, index: 99, x: 0 }))
        state.emsList.push({ x: 9, y: 9, z: 9, length: 1, width: 1, height: 1 })
        return next
      },
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) addBoxes(next, 4)
        else while (next.placed.length < 5) addBoxes(next, 1)
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const result = optimizePacking(initial, { beamWidth: 3, maxDepth: 1, maxStates: 8, maxMs: 8000 }, hooks, 'quantity')
    expect(snapshots.every((count) => count === 0), 'each commit must see the unpolluted parent, not a sibling mutation').toBe(true)
    expect(result.state.placed.some((box) => box.id.startsWith('pollute-'))).toBe(false)
    expect(initial.placed).toHaveLength(0)
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

  it('explores a third block when maxDepth is 3', () => {
    const initial = toyState()
    initial.emsList = [{ x: 0, y: 0, z: 0, length: 1000, width: 1000, height: 1000 }]
    const plantNextSlot = (state: PackingSearchState, choice: PackingBlockChoice) => {
      const next = commitChoice(state, choice)
      next.emsList = [{ x: next.placed.length * 1000, y: 0, z: 0, length: 1000, width: 1000, height: 1000 }]
      return next
    }
    const hooks: PackingSearchHooks = {
      commit: plantNextSlot,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) {
          addBoxes(next, 4)
          return next
        }
        if (next.placed.length >= 3) {
          while (next.placed.length < 6) addBoxes(next, 1)
          return next
        }
        while (next.placed.length < 4) addBoxes(next, 1)
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const depth2 = optimizePacking(initial, { beamWidth: 1, maxDepth: 2, maxStates: 16, maxMs: 8000 }, hooks, 'quantity')
    expect(depth2.state.placed.length, 'a depth-2 cap must not reach the third-block complete').toBe(4)

    const depth3 = optimizePacking(initial, { beamWidth: 1, maxDepth: 3, maxStates: 16, maxMs: 8000 }, hooks, 'quantity')
    expect(depth3.state.placed.length, 'maxDepth 3 must expand a third block and keep that complete').toBe(6)
    expect(depth3.search.strategy).toBe('beam')
  })

  it('returns the greedy complete, never a partial local state, when maxStates or maxMs is 0', () => {
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

    const zeroStates = optimizePacking(initial, { beamWidth: 8, maxStates: 0, maxMs: 8000 }, hooks, 'quantity')
    expect(zeroStates.state.placed.length).toBe(4)
    expect(zeroStates.search.budgetExceeded).toBe(true)
    expect(zeroStates.search.strategy).toBe('greedy')
    expect(zeroStates.search.claim).toBe('best-found-within-budget')

    const zeroMs = optimizePacking(initial, { beamWidth: 8, maxStates: 32, maxMs: 0 }, hooks, 'quantity')
    expect(zeroMs.state.placed.length).toBe(4)
    expect(zeroMs.search.budgetExceeded).toBe(true)
  })

  it('does not return an uncompleted local state when the state budget runs out after one expansion', () => {
    const initial = toyState()
    const hooks: PackingSearchHooks = {
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) addBoxes(next, 4)
        else while (next.placed.length < 5) addBoxes(next, 1)
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const result = optimizePacking(initial, { beamWidth: 8, maxStates: 1, maxMs: 8000 }, hooks, 'quantity')
    expect(result.search.budgetExceeded).toBe(true)
    expect(result.state.placed.length, 'incumbent must be a complete fill, not the single committed block').toBeGreaterThanOrEqual(4)
    expect(result.state.placed.length).not.toBe(1)
  })

  it('does not prune a branch whose remaining demand can still beat the incumbent', () => {
    const initial = toyState()
    initial.emsList = [{ x: 0, y: 0, z: 0, length: 1000, width: 1000, height: 1000 }]
    const plantOneSlot = (state: PackingSearchState, choice: PackingBlockChoice) => {
      const next = commitChoice(state, choice)
      next.emsList = [{ x: next.placed.length * 1000, y: 0, z: 0, length: 1000, width: 1000, height: 1000 }]
      return next
    }
    const afterOne = plantOneSlot(clonePackingSearchState(initial), {
      cargoId: 'cube',
      state: initial.cargoStates[0],
      ems: initial.emsList[0],
      point: { x: 0, y: 0, z: 0 },
      waste: 0,
      block: {
        cargoId: 'cube',
        name: 'cube',
        label: 'C',
        color: '#64748b',
        orientationKey: 'LWH',
        box: { orientationKey: 'LWH', length: 1000, width: 1000, height: 1000 },
        nx: 1,
        ny: 1,
        nz: 1,
        count: 1,
        length: 1000,
        width: 1000,
        height: 1000,
        volume: 1_000_000_000,
        footprintArea: 1_000_000,
        weight: 8,
      },
    })
    expect(optimisticCountBound(afterOne), 'leftover geometry only size-fits one more cube').toBe(2)
    expect(afterOne.placed.length + afterOne.cargoStates[0].remaining).toBeGreaterThan(4)

    const hooks: PackingSearchHooks = {
      commit: plantOneSlot,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) {
          addBoxes(next, 4)
          return next
        }
        if (next.placed.length >= 2) {
          while (next.placed.length < 6) addBoxes(next, 1)
          return next
        }
        while (next.placed.length < 4) addBoxes(next, 1)
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const result = optimizePacking(initial, { beamWidth: 1, maxDepth: 2, maxStates: 8, maxMs: 8000 }, hooks, 'quantity')
    expect(
      result.state.placed.length,
      'a safe remaining-demand bound must keep the branch that residual-fills to 6',
    ).toBe(6)
  })
})

function bulkyAndFillState(): PackingSearchState {
  const bulky: CargoItem = {
    id: 'bulky',
    name: 'bulky',
    label: 'B',
    length: 1000,
    width: 1000,
    height: 1000,
    weight: 8,
    quantity: 3,
    color: '#b45309',
    canRotate: false,
    stackable: false,
  }
  const fill: CargoItem = { ...cube(), id: 'fill', name: 'fill', label: 'F' }
  return {
    container: {
      id: 'toy-5x1',
      label: 'toy',
      description: 'volume: greedy 4 vs higher-volume 3',
      length: 4000,
      width: 1000,
      height: 1000,
      maxWeight: 50_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    },
    cargoStates: [
      { item: bulky, itemIndex: 0, label: 'B', remaining: 3, nextIndex: 1 },
      { item: fill, itemIndex: 1, label: 'F', remaining: 8, nextIndex: 1 },
    ],
    emsList: [{ x: 0, y: 0, z: 0, length: 4000, width: 1000, height: 1000 }],
    placed: [],
    placedById: new Map(),
    usedWeight: 0,
    minSupportRatio: MINIMUM_SUPPORT_RATIO,
  }
}

function usedVolumeOf(state: PackingSearchState) {
  return state.placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
}

function setPlacedLength(state: PackingSearchState, length: number) {
  for (const box of state.placed) box.length = length
}

describe('volume beam search', () => {
  it('does not copy quantity leftover windows or slot caps onto volume ranking', () => {
    const source = readFileSync(resolve('src/lib/packingSearch.ts'), 'utf8')
    expect(source).not.toMatch(/QUANTITY_COUNT_NEAR_WINDOW/)
    expect(source).not.toMatch(/passesQuantityHardCaps/)
  })

  it('picks a higher usedVolume complete even when that layout has fewer pieces than greedy', () => {
    const initial = bulkyAndFillState()
    const generated = generateBlockCandidates(initial, 'volume')
    expect(generated.some((choice) => choice.block.count === 4), 'greedy-sized first block must exist').toBe(true)
    expect(generated.some((choice) => choice.block.count === 3), 'alternative first block must exist').toBe(true)

    const hooks: PackingSearchHooks = {
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) {
          addBoxes(next, 4)
          return next
        }
        if (next.placed.length === 3) {
          setPlacedLength(next, 1500)
          return next
        }
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const greedy = hooks.complete(clonePackingSearchState(initial))
    expect(greedy.placed.length, 'greedy complete is the 4-piece incumbent').toBe(4)
    expect(usedVolumeOf(greedy)).toBe(4_000_000_000)

    const quantityPick = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks, 'quantity')
    expect(
      quantityPick.state.placed.length,
      'quantity still prefers more pieces on the same hooks',
    ).toBe(4)

    const result = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks, 'volume')
    expect(usedVolumeOf(result.state), 'volume must keep the higher usedVolume even with fewer pieces').toBe(4_500_000_000)
    expect(result.state.placed.length).toBe(3)
    expect(result.search.strategy).toBe('beam')
    expect(usedVolumeOf(result.state)).toBeGreaterThan(usedVolumeOf(greedy))
  })

  it('breaks an equal usedVolume with the higher piece count', () => {
    const initial = bulkyAndFillState()
    const hooks: PackingSearchHooks = {
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) {
          addBoxes(next, 4)
          return next
        }
        if (next.placed.length === 3) {
          while (next.placed.length < 5) addBoxes(next, 1)
          setPlacedLength(next, 800)
          return next
        }
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const result = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks, 'volume')
    expect(usedVolumeOf(result.state)).toBe(4_000_000_000)
    expect(result.state.placed.length, 'same usedVolume must prefer more pieces').toBe(5)
  })

  it('does not let a higher piece count with lower usedVolume win in volume mode', () => {
    const initial = bulkyAndFillState()
    const hooks: PackingSearchHooks = {
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) {
          addBoxes(next, 4)
          return next
        }
        if (next.placed.length === 3) {
          while (next.placed.length < 5) addBoxes(next, 1)
          setPlacedLength(next, 500)
          return next
        }
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const greedy = hooks.complete(clonePackingSearchState(initial))
    const result = optimizePacking(initial, DEFAULT_QUANTITY_SEARCH_BUDGET, hooks, 'volume')
    expect(usedVolumeOf(result.state), 'volume must not trade usedVolume away for extra pieces').toBe(4_000_000_000)
    expect(result.state.placed.length).toBe(4)
    expect(usedVolumeOf(result.state)).toBe(usedVolumeOf(greedy))
    expect(result.state.placed.length).toBeLessThan(5)
  })

  it('returns the greedy complete and budgetExceeded when the beam cannot expand', () => {
    const initial = bulkyAndFillState()
    const hooks: PackingSearchHooks = {
      commit: commitChoice,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        if (next.placed.length === 0) addBoxes(next, 4)
        return next
      },
      quality: (state) => qualityOf(state, 0),
    }

    const zeroStates = optimizePacking(initial, { beamWidth: 8, maxStates: 0, maxMs: 8000 }, hooks, 'volume')
    expect(zeroStates.state.placed.length).toBe(4)
    expect(zeroStates.search.budgetExceeded).toBe(true)
    expect(zeroStates.search.strategy).toBe('greedy')

    const zeroMs = optimizePacking(initial, { beamWidth: 8, maxStates: 32, maxMs: 0 }, hooks, 'volume')
    expect(zeroMs.state.placed.length).toBeGreaterThan(0)
    expect(zeroMs.search.budgetExceeded).toBe(true)
  })

  it('optimistic volume bound uses leftover EMS volume so remaining cargo volume without geometry fails when leftover is tighter', () => {
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
    const leftover = { x: 0, y: 0, z: 0, length: 1500, width: 500, height: 500 }
    const geometric = bestBlocksForSpace(item, 8, leftover)
    const sizeFit = Math.max(0, ...geometric.map((block) => block.count))
    const unitVolume = item.length * item.width * item.height
    const sizeFitVolume = sizeFit * unitVolume
    const remainingCargoVolume = 8 * unitVolume
    expect(sizeFit, 'constructed leftover must size-fit some but not all remaining cubes').toBeGreaterThan(0)
    expect(sizeFit).toBeLessThan(8)
    expect(sizeFitVolume).toBeLessThan(remainingCargoVolume)

    const state: PackingSearchState = {
      container: {
        id: 'bound',
        label: 'bound',
        description: 'bound',
        length: 1500,
        width: 500,
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

    const bound = optimisticVolumeBound(state)
    expect(bound).toBeGreaterThanOrEqual(usedVolumeOf(state) + sizeFitVolume)
    expect(
      bound,
      'bound must follow leftover EMS usable volume, not remaining cargo volume alone',
    ).toBeLessThan(usedVolumeOf(state) + remainingCargoVolume)

    const demandOnly = usedVolumeOf(state) + remainingCargoVolume
    expect(demandOnly, 'usedVolume+remaining cargo volume ignores tighter leftover geometry').toBeGreaterThan(bound)
  })
})
