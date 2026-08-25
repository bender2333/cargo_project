import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec, PlacementBox } from '../types'
import { bestBlocksForSpace } from './blocks'
import { canPlaceBox, canStageBlock, isSupportRatioAccepted, MINIMUM_SUPPORT_RATIO, supportDetails } from './packingFeasibility'
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
    description: 'tiny feasibility container',
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

function placedBox(overrides: Partial<PlacementBox> = {}): PlacementBox {
  return {
    id: 'base-1',
    cargoId: 'base',
    name: 'Base',
    label: 'B',
    index: 1,
    x: 0,
    y: 0,
    z: 0,
    length: 1000,
    width: 1000,
    height: 500,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: 1,
    color: '#94a3b8',
    canRotate: false,
    stackable: true,
    maxStackLayers: 1,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    ...overrides,
  }
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

function blockChoice(overrides: Partial<PackingBlockChoice> & Pick<PackingBlockChoice, 'block' | 'state'>): PackingBlockChoice {
  const ems = overrides.ems ?? { x: 0, y: 0, z: 0, length: 4000, width: 2000, height: 2000 }
  const point = overrides.point ?? { x: ems.x, y: ems.y, z: ems.z }
  return {
    cargoId: overrides.state.item.id,
    ems,
    point,
    waste: ems.length * ems.width * ems.height - overrides.block.volume,
    ...overrides,
  }
}

function unitBlock(item: CargoItem, nx: number, ny: number, nz: number) {
  const count = nx * ny * nz
  return {
    cargoId: item.id,
    name: item.name,
    label: item.label ?? item.name,
    color: item.color,
    orientationKey: 'LWH' as const,
    box: { orientationKey: 'LWH' as const, length: item.length, width: item.width, height: item.height },
    nx,
    ny,
    nz,
    count,
    length: item.length * nx,
    width: item.width * ny,
    height: item.height * nz,
    volume: item.length * nx * item.width * ny * item.height * nz,
    footprintArea: item.length * nx * item.width * ny,
    weight: item.weight * count,
  }
}

describe('canPlaceBox shared feasibility', () => {
  it('rejects a groundOnly box at z>0 even when a floor box would support it', () => {
    const item = cargo({ id: 'ground', groundOnly: true, height: 500 })
    const base = placedBox({ id: 'floor', cargoId: 'floor', maxStackLayers: 99, stackable: true })
    const placedById = new Map([[base.id, base]])

    expect(canPlaceBox(
      { x: 0, y: 0, z: 500 },
      { length: 1000, width: 1000, height: 500 },
      container(),
      [base],
      placedById,
      item,
    )).toBe(false)

    expect(canPlaceBox(
      { x: 0, y: 0, z: 0 },
      { length: 1000, width: 1000, height: 500 },
      container(),
      [],
      new Map(),
      item,
    )).toBe(true)
  })

  it('rejects a second box stacked on a maxStackLayers=1 base', () => {
    const rider = cargo({ id: 'rider', height: 500, maxStackLayers: 99 })
    const base = placedBox({ id: 'cap-1', maxStackLayers: 1, stackable: true })
    const placedById = new Map([[base.id, base]])

    expect(canPlaceBox(
      { x: 0, y: 0, z: 500 },
      { length: 1000, width: 1000, height: 500 },
      container(),
      [base],
      placedById,
      rider,
    )).toBe(false)
  })

  it('uses the same 0.5 support-ratio policy as isSupportRatioAccepted', () => {
    const item = cargo({ id: 'partial', height: 500 })
    const short = placedBox({ id: 'short', length: 499, width: 1000, height: 500, maxStackLayers: 99 })
    const half = placedBox({ id: 'half', length: 500, width: 1000, height: 500, maxStackLayers: 99 })
    const box = { length: 1000, width: 1000, height: 500 }
    const point = { x: 0, y: 0, z: 500 }

    const shortSupport = supportDetails(point, box, [short])
    const halfSupport = supportDetails(point, box, [half])
    expect(shortSupport.supportRatio).toBeLessThan(0.5)
    expect(halfSupport.supportRatio).toBe(0.5)
    expect(isSupportRatioAccepted(shortSupport.supportRatio)).toBe(false)
    expect(isSupportRatioAccepted(halfSupport.supportRatio)).toBe(true)

    expect(canPlaceBox(point, box, container(), [short], new Map([[short.id, short]]), item)).toBe(false)
    expect(canPlaceBox(point, box, container(), [half], new Map([[half.id, half]]), item)).toBe(true)
  })
})

describe('canStageBlock shared feasibility', () => {
  it('rejects a block whose weight exceeds remaining payload', () => {
    const item = cargo({ id: 'heavy', weight: 40, quantity: 4 })
    const state = searchState({
      container: container({ maxWeight: 100 }),
      usedWeight: 90,
      cargoStates: [cargoState(item, 4)],
    })
    const choice = blockChoice({
      state: state.cargoStates[0],
      block: unitBlock(item, 2, 1, 1),
    })
    expect(choice.block.weight).toBe(80)
    expect(canStageBlock(state, choice)).toBe(false)
  })

  it('rejects the whole block when the second unit overlaps an already placed box', () => {
    const item = cargo({ id: 'row', length: 500, width: 500, height: 500, quantity: 4 })
    const occupant = placedBox({
      id: 'occupant',
      cargoId: 'other',
      x: 500,
      y: 0,
      z: 0,
      length: 500,
      width: 500,
      height: 500,
      maxStackLayers: 99,
    })
    const state = searchState({
      cargoStates: [cargoState(item, 4)],
      placed: [occupant],
      placedById: new Map([[occupant.id, occupant]]),
    })
    const choice = blockChoice({
      state: state.cargoStates[0],
      block: unitBlock(item, 2, 1, 1),
      point: { x: 0, y: 0, z: 0 },
    })
    expect(canStageBlock(state, choice)).toBe(false)
  })

  it('accepts a floor 2x1 block when both units are empty and within payload', () => {
    const item = cargo({ id: 'row', length: 500, width: 500, height: 500, quantity: 4 })
    const state = searchState({ cargoStates: [cargoState(item, 4)] })
    const choice = blockChoice({
      state: state.cargoStates[0],
      block: unitBlock(item, 2, 1, 1),
    })
    expect(canStageBlock(state, choice)).toBe(true)
  })
})

describe('optimistic size-fit is not proven placeable count', () => {
  it('keeps an unsupported leftover size-fit as an optimistic bound, not a feasible count', () => {
    const item = cargo({ id: 'air', length: 500, width: 500, height: 500, quantity: 8, stackable: true })
    const leftover = { x: 0, y: 0, z: 500, length: 2000, width: 1000, height: 500 }
    const fitted = bestBlocksForSpace(item, 8, leftover)
    expect(fitted.some((block) => block.count > 0)).toBe(true)

    const state = searchState({
      cargoStates: [cargoState(item, 8)],
      emsList: [leftover],
      placed: [],
      placedById: new Map(),
    })
    const floating = blockChoice({
      state: state.cargoStates[0],
      block: unitBlock(item, 2, 1, 1),
      ems: leftover,
      point: { x: leftover.x, y: leftover.y, z: leftover.z },
    })

    expect(canPlaceBox(
      { x: leftover.x, y: leftover.y, z: leftover.z },
      { length: item.length, width: item.width, height: item.height },
      state.container,
      [],
      new Map(),
      item,
    )).toBe(false)
    expect(canStageBlock(state, floating)).toBe(false)
  })
})
