import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec, PlacedBox } from '../types'
import { calculatePacking, UNPLACED_REASON_CODES } from './packing'
import { stackCapacity, violatesStackChain } from './stackCapacity'

const snapshot12Container: ContainerSpec = {
  id: '20gp',
  label: "Container 20'",
  description: '20 ft general purpose container from EasyCargo cargo spaces',
  length: 5758,
  width: 2352,
  height: 2385,
  maxWeight: 28200,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'cargo',
    name: 'Carton',
    label: 'A',
    length: 400,
    width: 500,
    height: 600,
    weight: 20,
    quantity: 1,
    color: '#f59e0b',
    canRotate: true,
    stackable: true,
    ...overrides,
  }
}

function snapshot12EquivalentCargo(): CargoItem[] {
  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return [
    cargo({ id: 'unlimited-a', name: 'Carton A', label: 'A', quantity: 18 }),
    cargo({ id: 'cap4-e', name: 'Carton E', label: 'B', quantity: 10, maxStackLayers: 4 }),
    cargo({ id: 'cap4-f', name: 'Carton F', label: 'C', quantity: 10, maxStackLayers: 4 }),
    cargo({ id: 'cap3-b', name: 'Carton B', label: 'D', quantity: 10, maxStackLayers: 3 }),
    cargo({ id: 'cap3-d', name: 'Carton D', label: 'E', quantity: 10, maxStackLayers: 3 }),
    cargo({ id: 'cap3-e', name: 'Carton E', label: 'F', quantity: 10, maxStackLayers: 3 }),
    ...Array.from({ length: 3 }, (_, index) =>
      cargo({
        id: `capacity-one-${index}`,
        name: `Capacity One ${index}`,
        label: labels[6 + index],
        quantity: 10,
        maxStackLayers: 1,
      }),
    ),
    ...Array.from({ length: 12 }, (_, index) =>
      cargo({
        id: `non-stackable-${index}`,
        name: `Non Stackable ${index}`,
        label: labels[9 + index],
        quantity: 10,
        stackable: false,
      }),
    ),
  ]
}

function verticalSupportGraph(placed: PlacedBox[]) {
  return new Map(placed.map((box) => [box.id, {
    ...box,
    physicalLayer: box.verticalLayer ?? box.physicalLayer,
    supportedBy: box.verticalSupportedBy ?? [],
  }]))
}

function expectNoStackCapacityViolations(placed: PlacedBox[]) {
  const graph = verticalSupportGraph(placed)
  for (const box of graph.values()) {
    expect(violatesStackChain(box, graph)).toBeNull()
  }
}

function topOccupiedSupportIds(placed: PlacedBox[]) {
  return new Set(placed.filter((box) => box.z > 0).flatMap((box) => box.verticalSupportedBy ?? []))
}

describe('calculatePacking stack-fill optimization', () => {
  it('uses capacity-one cargo as top passengers in the snapshot-12 style automatic load', () => {
    const result = calculatePacking(snapshot12Container, snapshot12EquivalentCargo(), { loadingMode: 'quantity' })

    expect(result.totalCargoCount).toBe(218)
    expect(result.placedCount).toBeGreaterThanOrEqual(118)
    expect(result.unplaced.every((entry) => entry.reasonCode === UNPLACED_REASON_CODES.NO_SPACE)).toBe(true)

    expectNoStackCapacityViolations(result.placed)

    const capacityOne = result.placed.filter((box) => stackCapacity(box) === 1)
    const capacityOneTopPassengers = capacityOne.filter((box) => (box.verticalSupportedBy ?? []).length > 0)
    const lockedCapacityOneFloorBoxes = capacityOne
      .filter((box) => box.z === 0)
      .filter((box) => !topOccupiedSupportIds(result.placed).has(box.id))

    expect(capacityOneTopPassengers.length).toBeGreaterThanOrEqual(20)
    expect(lockedCapacityOneFloorBoxes.length).toBeLessThan(33)
  })

  it('keeps weight and input modes on their existing loading semantics', () => {
    const container: ContainerSpec = {
      id: 'input-order',
      label: 'Input order',
      description: '',
      length: 1000,
      width: 1000,
      height: 1800,
      maxWeight: 10000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }
    const items = [
      cargo({ id: 'limited-first', label: 'L', length: 1000, width: 1000, height: 600, quantity: 1, canRotate: false, stackable: false }),
      cargo({ id: 'support-second', label: 'S', length: 1000, width: 1000, height: 600, quantity: 2, canRotate: false }),
    ]

    const input = calculatePacking(container, items, { loadingMode: 'input' })
    const weight = calculatePacking(container, items, { loadingMode: 'weight' })

    expect(input.placed.map((box) => box.cargoId)).toEqual(['limited-first'])
    expect(weight.placed.map((box) => box.cargoId)).toEqual(['limited-first'])
  })

  it('adds a capacity-limit diagnostic only when low stack capacity cargo is the active constraint', () => {
    const constrained = calculatePacking(snapshot12Container, snapshot12EquivalentCargo(), { loadingMode: 'quantity' })
    const diagnostic = constrained.diagnostics.find((entry) => entry.id === 'stack-capacity-limit')

    expect(diagnostic).toMatchObject({
      severity: 'warning',
    })
    expect(diagnostic?.message).toContain('stack capacity')
    expect(diagnostic?.message).toContain('不可堆叠')

    const complete = calculatePacking(snapshot12Container, [
      cargo({ id: 'complete-a', label: 'A', quantity: 2 }),
      cargo({ id: 'complete-b', label: 'B', quantity: 2, stackable: false }),
    ], { loadingMode: 'quantity' })

    expect(complete.unplaced).toEqual([])
    expect(complete.diagnostics.find((entry) => entry.id === 'stack-capacity-limit')).toBeUndefined()
  })
})
