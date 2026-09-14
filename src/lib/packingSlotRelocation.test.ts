import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CargoItem, PlacementBox } from '../types'
import { generateBlockCandidates, type PackingBlockChoice } from './packingCandidates'
import { MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import { packingQualityOf } from './packingObjective'
import type { PackingSearchHooks } from './packingSearch'
import { clonePackingSearchState, type PackingSearchState } from './packingSearchState'
import { relocateLargestBoundarySlot } from './packingSlotRelocation'
import { initEMS, splitEMS } from './emsSpace'

function cube(): CargoItem {
  return {
    id: 'cube',
    name: 'cube',
    label: 'C',
    length: 1000,
    width: 1000,
    height: 1000,
    weight: 8,
    quantity: 2,
    color: '#64748b',
    canRotate: false,
    stackable: false,
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

function slottedTwoCubes(): PackingSearchState {
  const item = cube()
  const a = dummyBox({ id: 'cube-1', index: 1, x: 0 })
  const b = dummyBox({ id: 'cube-2', index: 2, x: 1400 })
  const placed = [a, b]
  return {
    container: {
      id: 'slot-3000',
      label: 'slot',
      description: 'two cubes with a 400mm inter-cargo gap toward the door',
      length: 3000,
      width: 1000,
      height: 1000,
      maxWeight: 50_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    },
    cargoStates: [{ item, itemIndex: 0, label: 'C', remaining: 0, nextIndex: 3 }],
    emsList: splitEMS(splitEMS(initEMS({ length: 3000, width: 1000, height: 1000 }), {
      x: 0, y: 0, z: 0, length: 1000, width: 1000, height: 1000,
    }), {
      x: 1400, y: 0, z: 0, length: 1000, width: 1000, height: 1000,
    }),
    placed,
    placedById: new Map(placed.map((box) => [box.id, box])),
    usedWeight: 16,
    minSupportRatio: MINIMUM_SUPPORT_RATIO,
  }
}

const hooks: PackingSearchHooks = {
  commit: commitChoice,
  complete: (state) => clonePackingSearchState(state),
  quality: packingQualityOf,
}

describe('bounded slot relocation seam', () => {
  it('is not imported by calculatePacking', () => {
    const packingSource = readFileSync(resolve('src/lib/packing.ts'), 'utf8')
    expect(packingSource).not.toMatch(/packingSlotRelocation/)
    expect(packingSource).not.toMatch(/relocateLargestBoundarySlot/)
  })

  it('can close a 400mm boundary-connected gap without dropping quantity', () => {
    const initial = slottedTwoCubes()
    const before = packingQualityOf(initial)
    expect(before.placedCount).toBe(2)
    expect(before.interCargoMaxMm).toBeGreaterThanOrEqual(400)

    const generated = generateBlockCandidates(initial, 'quantity')
    expect(generated.length).toBeGreaterThanOrEqual(0)

    const result = relocateLargestBoundarySlot(initial, hooks, 'quantity', { seed: 1, maxRounds: 1, maxMs: 1000 })
    const after = packingQualityOf(result.state)
    expect(after.placedCount).toBe(before.placedCount)
    expect(after.interCargoMaxMm).toBeLessThan(before.interCargoMaxMm)
    expect(result.improved).toBe(true)
  })

  it('does not accept a refill that drops quantity', () => {
    const initial = slottedTwoCubes()
    const dropHooks: PackingSearchHooks = {
      commit: (state) => state,
      complete: (state) => {
        const next = clonePackingSearchState(state)
        next.placed = next.placed.slice(0, 1)
        next.placedById = new Map(next.placed.map((box) => [box.id, box]))
        next.cargoStates[0].remaining = 1
        return next
      },
      quality: packingQualityOf,
    }
    const result = relocateLargestBoundarySlot(initial, dropHooks, 'quantity', { seed: 1, maxRounds: 1, maxMs: 1000 })
    expect(result.state.placed.length).toBe(2)
    expect(result.improved).toBe(false)
  })
})
