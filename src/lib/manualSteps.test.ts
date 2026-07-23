import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec, PlacedBox } from '../types'
import { buildLoadingTaskGroups } from './loadingTaskGroups'
import { buildManualPackingResult } from './manualSteps'

const container: ContainerSpec = {
  id: 'manual',
  label: 'Manual container',
  description: '',
  length: 3000,
  width: 1200,
  height: 1200,
  maxWeight: 10_000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

function makeBox(overrides: Partial<PlacedBox> & Pick<PlacedBox, 'id'>): PlacedBox {
  return {
    id: overrides.id,
    cargoId: overrides.cargoId ?? `cargo-${overrides.id}`,
    name: overrides.name ?? `Box ${overrides.id}`,
    label: overrides.label ?? 'A',
    index: overrides.index ?? 1,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    z: overrides.z ?? 0,
    length: overrides.length ?? 600,
    width: overrides.width ?? 500,
    height: overrides.height ?? 400,
    orientationKey: overrides.orientationKey ?? 'LWH',
    labelRotationDeg: overrides.labelRotationDeg ?? 0,
    weight: overrides.weight ?? 10,
    color: overrides.color ?? '#f59e0b',
    canRotate: overrides.canRotate ?? true,
    stackable: overrides.stackable ?? true,
    physicalLayer: overrides.physicalLayer ?? 1,
    verticalLayer: overrides.verticalLayer,
    workStep: overrides.workStep ?? 1,
    supportType: overrides.supportType ?? 'floor',
    supportedBy: overrides.supportedBy ?? [],
    verticalSupportedBy: overrides.verticalSupportedBy,
  }
}

function cargoForBoxes(boxes: PlacedBox[]): CargoItem[] {
  const byCargo = new Map<string, CargoItem>()
  for (const box of boxes) {
    const existing = byCargo.get(box.cargoId)
    if (existing) {
      existing.quantity += 1
      continue
    }
    byCargo.set(box.cargoId, {
      id: box.cargoId,
      name: box.name,
      label: box.label,
      length: box.length,
      width: box.width,
      height: box.height,
      weight: box.weight,
      quantity: 1,
      color: box.color,
      canRotate: box.canRotate,
      stackable: box.stackable,
      maxStackLayers: box.maxStackLayers,
      groundOnly: box.groundOnly,
    })
  }
  return [...byCargo.values()]
}

describe('buildManualPackingResult', () => {
  it('infers loading-depth physical layers for manually placed boxes', () => {
    const boxes = [
      makeBox({ id: 'inner', x: 0 }),
      makeBox({ id: 'middle', x: 600 }),
      makeBox({ id: 'door', x: 1200 }),
    ]
    const result = buildManualPackingResult(boxes, container, cargoForBoxes(boxes))

    expect(result.placed.map((box) => [box.id, box.physicalLayer])).toEqual([
      ['inner', 1],
      ['middle', 2],
      ['door', 3],
    ])
    expect(result.placed.find((box) => box.id === 'door')?.supportedBy).toEqual(['middle'])
  })

  it('orders manual work steps by layer, low height, then width position', () => {
    const boxes = [
      makeBox({ id: 'high', x: 0, y: 0, z: 400 }),
      makeBox({ id: 'low-right', x: 0, y: 500, z: 0 }),
      makeBox({ id: 'low-left', x: 0, y: 0, z: 0 }),
      makeBox({ id: 'next-layer', x: 600, y: 0, z: 0 }),
    ]
    const result = buildManualPackingResult(boxes, container, cargoForBoxes(boxes))

    expect(result.workSteps.map((step) => step.boxId)).toEqual(['low-left', 'low-right', 'high', 'next-layer'])
    expect(result.placed.map((box) => [box.id, box.workStep])).toEqual([
      ['high', 3],
      ['low-right', 2],
      ['low-left', 1],
      ['next-layer', 4],
    ])
  })

  it('returns an empty result for empty manual input', () => {
    const result = buildManualPackingResult([], container, [])

    expect(result.placed).toEqual([])
    expect(result.workSteps).toEqual([])
    expect(result.layers).toEqual([])
    expect(result.placedCount).toBe(0)
    expect(result.totalCargoCount).toBe(0)
  })

  it('produces one work step per box and can feed loading task groups', () => {
    const boxes = [
      makeBox({ id: 'a', x: 0, label: 'A' }),
      makeBox({ id: 'b', x: 600, label: 'B', color: '#2563eb' }),
      makeBox({ id: 'c', x: 1200, label: 'C', color: '#16a34a' }),
    ]
    const result = buildManualPackingResult(boxes, container, cargoForBoxes(boxes))

    expect(result.workSteps).toHaveLength(result.placed.length)
    expect(buildLoadingTaskGroups(result).length).toBeGreaterThan(0)
  })

  it('reports planned, placed, and unplaced quantities by cargo id with real names and indexes', () => {
    const cargoItems: CargoItem[] = [
      {
        id: 'cargo-a',
        name: 'Medical pump',
        label: 'P',
        length: 600,
        width: 500,
        height: 400,
        weight: 10,
        quantity: 3,
        color: '#f59e0b',
        canRotate: true,
        stackable: true,
      },
      {
        id: 'cargo-b',
        name: 'Control valve',
        label: 'V',
        length: 300,
        width: 300,
        height: 300,
        weight: 5,
        quantity: 2,
        color: '#2563eb',
        canRotate: false,
        stackable: false,
      },
    ]
    const boxes = [
      makeBox({ id: 'pump-1', cargoId: 'cargo-a', name: 'P', label: 'P', index: 99, x: 0 }),
      makeBox({ id: 'pump-2', cargoId: 'cargo-a', name: 'P', label: 'P', index: 99, x: 600 }),
    ]

    const result = buildManualPackingResult(boxes, container, cargoItems)

    expect(result.totalCargoCount).toBe(5)
    expect(result.placed.map((box) => [box.name, box.index])).toEqual([
      ['Medical pump', 1],
      ['Medical pump', 2],
    ])
    expect(result.unplaced).toEqual([
      {
        cargoId: 'cargo-a',
        name: 'Medical pump',
        label: 'P',
        quantity: 1,
        reason: 'Not placed in manual plan',
        reasonCode: 'manual-not-placed',
      },
      {
        cargoId: 'cargo-b',
        name: 'Control valve',
        label: 'V',
        quantity: 2,
        reason: 'Not placed in manual plan',
        reasonCode: 'manual-not-placed',
      },
    ])
    expect(result.labelStats).toEqual([
      expect.objectContaining({ label: 'P', name: 'Medical pump', planned: 3, placed: 2, unplaced: 1 }),
      expect.objectContaining({ label: 'V', name: 'Control valve', planned: 2, placed: 0, unplaced: 2 }),
    ])
  })
})
