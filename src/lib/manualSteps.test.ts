import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec, PlacementBox } from '../types'
import { buildLoadingTaskGroups } from './loadingTaskGroups'
import { calculatePacking } from './packing'
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

function makeBox(overrides: Partial<PlacementBox> & Pick<PlacementBox, 'id'>): PlacementBox {
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
    ...(overrides.blockingInvalid ? { blockingInvalid: true as const } : {}),
    physicalLayer: overrides.physicalLayer ?? 1,
    workStep: overrides.workStep ?? 1,
    supportType: overrides.supportType ?? 'floor',
    supportedBy: overrides.supportedBy ?? [],
  }
}

function cargoForBoxes(boxes: PlacementBox[]): CargoItem[] {
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
  it('infers loading-depth waves for manually placed boxes', () => {
    const boxes = [
      makeBox({ id: 'inner', x: 0 }),
      makeBox({ id: 'middle', x: 600 }),
      makeBox({ id: 'door', x: 1200 }),
    ]
    const result = buildManualPackingResult(boxes, container, cargoForBoxes(boxes))

    // All three sit on the floor and differ only in depth, so the wave they belong to
    // is `depthLayer`. They are all vertical layer 1 — nothing is stacked on anything.
    // This previously asserted `physicalLayer`/`supportedBy`, which conflated the
    // horizontal push-against wave with vertical support.
    expect(result.placed.map((box) => [box.id, box.depthLayer])).toEqual([
      ['inner', 1],
      ['middle', 2],
      ['door', 3],
    ])
    expect(result.placed.every((box) => box.physicalLayer === 1)).toBe(true)
    expect(result.placed.find((box) => box.id === 'door')?.supportedBy).toEqual([])
  })

  it('derives real vertical support and physical layers for stacked manual boxes', () => {
    const boxes = [
      makeBox({ id: 'base', x: 0, y: 0, z: 0, height: 400 }),
      makeBox({ id: 'top', x: 0, y: 0, z: 400, height: 400 }),
    ]
    const result = buildManualPackingResult(boxes, container, cargoForBoxes(boxes))

    const base = result.placed.find((box) => box.id === 'base')
    const top = result.placed.find((box) => box.id === 'top')
    expect(base).toMatchObject({ physicalLayer: 1, supportType: 'floor', supportedBy: [] })
    expect(top).toMatchObject({ physicalLayer: 2, supportType: 'fully-supported', supportedBy: ['base'] })
    expect(result.workSteps.map((step) => step.boxId)).toEqual(['base', 'top'])
    expect(base!.workStep).toBeLessThan(top!.workStep)
    expect(result.placed.every((box) => box.depthLayer != null)).toBe(true)
  })

  it('orders manual work steps with supporters before supported boxes', () => {
    const boxes = [
      makeBox({ id: 'high', x: 0, y: 0, z: 400 }),
      makeBox({ id: 'low-right', x: 0, y: 500, z: 0 }),
      makeBox({ id: 'low-left', x: 0, y: 0, z: 0 }),
      makeBox({ id: 'next-layer', x: 600, y: 0, z: 0 }),
    ]
    const result = buildManualPackingResult(boxes, container, cargoForBoxes(boxes))

    // Support is a hard constraint: high rests on low-left, so low-left loads first.
    // Among currently loadable floor boxes, far-wall-outward depth is the tiebreaker.
    expect(result.workSteps.map((step) => step.boxId)).toEqual(['low-left', 'high', 'low-right', 'next-layer'])
    const byId = new Map(result.placed.map((box) => [box.id, box.workStep]))
    expect(byId.get('low-left')).toBeLessThan(byId.get('high')!)
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
  it('matches automatic finalization when the same placed coordinates become a manual result', () => {
    const cargoItems: CargoItem[] = [{
      id: 'cargo-a',
      name: 'Crate',
      label: 'A',
      length: 600,
      width: 500,
      height: 400,
      weight: 10,
      quantity: 2,
      color: '#f59e0b',
      canRotate: true,
      stackable: true,
    }]
    const automatic = calculatePacking(container, cargoItems, { loadingMode: 'quantity' })
    expect(automatic.placed).toHaveLength(2)

    const manual = buildManualPackingResult(automatic.placed, container, cargoItems)
    const projection = (result: typeof automatic) => result.placed.map((box) => ({
      id: box.id,
      supportedBy: box.supportedBy,
      physicalLayer: box.physicalLayer,
      depthLayer: box.depthLayer,
      workStep: box.workStep,
      supportType: box.supportType,
    }))

    expect(projection(manual)).toEqual(projection(automatic))
    expect(manual.layers).toEqual(automatic.layers)
    expect(manual.workSteps).toEqual(automatic.workSteps)
  })
})

// P1-3 RED tests — diagnostics conversion

describe('buildManualPackingResult diagnostics', () => {
  it('surfaces overweight as an error diagnostic when total weight exceeds container maxWeight', () => {
    const heavyContainer = {
      id: 'manual',
      label: 'Heavy test',
      description: '',
      length: 3000,
      width: 1200,
      height: 1200,
      maxWeight: 100,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }
    const boxes = [
      makeBox({ id: 'h1', x: 0, weight: 60 }),
      makeBox({ id: 'h2', x: 600, weight: 60 }),
    ]

    const result = buildManualPackingResult(boxes, heavyContainer, cargoForBoxes(boxes))

    const overweightDiag = result.diagnostics.find((d) => d.id === 'weight-check')
    expect(overweightDiag).toBeDefined()
    expect(overweightDiag!.severity).toBe('error')
  })

  it('uses projected overweight validation instead of duplicating the computed fallback', () => {
    const heavyContainer = { ...container, maxWeight: 100 }
    const boxes = [
      makeBox({ id: 'h1', x: 0, weight: 60 }),
      makeBox({ id: 'h2', x: 600, weight: 60 }),
    ]
    const result = buildManualPackingResult(boxes, heavyContainer, cargoForBoxes(boxes), [{
      type: 'overweight',
      boxId: 'h1',
      severity: 'error',
      message: 'overweight',
    }])

    expect(result.diagnostics).toEqual([expect.objectContaining({
      id: 'weight-check:overweight:h1',
      code: 'weight-check',
      source: 'manual',
      sourceIssueId: 'overweight:h1',
    })])
  })

  it('produces no weight-check error when total weight is within limit', () => {
    const boxes = [makeBox({ id: 'light', x: 0, weight: 10 })]

    const result = buildManualPackingResult(boxes, container, cargoForBoxes(boxes))

    const weightDiag = result.diagnostics.find((d) => d.id === 'weight-check')
    // Either absent or info/ok — never 'error' when within limit
    expect(weightDiag?.severity ?? 'info').not.toBe('error')
  })
})

// P3-8 — blocking-invalid boxes stay visible but leave statistics

describe('buildManualPackingResult blocking-invalid statistics', () => {
  it('keeps blocking-invalid boxes in placed while excluding them from aggregates', () => {
    const valid = makeBox({
      id: 'valid',
      cargoId: 'cargo-a',
      label: 'A',
      x: 0,
      y: 0,
      z: 0,
      length: 600,
      width: 500,
      height: 400,
    })
    const invalid = makeBox({
      id: 'invalid',
      cargoId: 'cargo-b',
      label: 'B',
      x: 0,
      y: 0,
      z: 0,
      length: 600,
      width: 500,
      height: 400,
      blockingInvalid: true,
    })
    const cargoItems: CargoItem[] = [
      {
        id: 'cargo-a',
        name: 'Valid cargo',
        label: 'A',
        length: 600,
        width: 500,
        height: 400,
        weight: 10,
        quantity: 1,
        color: '#f59e0b',
        canRotate: true,
        stackable: true,
      },
      {
        id: 'cargo-b',
        name: 'Invalid cargo',
        label: 'B',
        length: 600,
        width: 500,
        height: 400,
        weight: 10,
        quantity: 1,
        color: '#0ea5e9',
        canRotate: true,
        stackable: true,
      },
    ]

    const result = buildManualPackingResult([valid, invalid], container, cargoItems)

    expect(result.placed.map((box) => box.id).sort()).toEqual(['invalid', 'valid'])
    expect(result.placed.find((box) => box.id === 'invalid')?.blockingInvalid).toBe(true)
    expect(result.placedCount).toBe(1)
    expect(result.usedVolume).toBe(valid.length * valid.width * valid.height)
    expect(result.usedWeight).toBe(valid.weight)
    expect(result.labelStats).toEqual([
      expect.objectContaining({ label: 'A', planned: 1, placed: 1, unplaced: 0 }),
      expect.objectContaining({ label: 'B', planned: 1, placed: 0, unplaced: 1 }),
    ])
    expect(result.unplaced).toEqual([
      expect.objectContaining({ cargoId: 'cargo-b', quantity: 1 }),
    ])
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0]).toMatchObject({ count: 1, physicalLayer: 1 })
    expect(result.layers[0].labels).toEqual([
      expect.objectContaining({ label: 'A', count: 1 }),
    ])
  })

  it('does not pollute layer 1 maxZ with unsupported floating boxes', () => {
    const floor = makeBox({
      id: 'floor',
      cargoId: 'cargo-a',
      label: 'A',
      x: 0,
      y: 0,
      z: 0,
      length: 600,
      width: 500,
      height: 400,
    })
    const floating = makeBox({
      id: 'floating',
      cargoId: 'cargo-b',
      label: 'B',
      x: 700,
      y: 0,
      z: 800,
      length: 600,
      width: 500,
      height: 400,
      blockingInvalid: true,
    })
    const cargoItems: CargoItem[] = [
      {
        id: 'cargo-a',
        name: 'Floor',
        label: 'A',
        length: 600,
        width: 500,
        height: 400,
        weight: 10,
        quantity: 1,
        color: '#f59e0b',
        canRotate: true,
        stackable: true,
      },
      {
        id: 'cargo-b',
        name: 'Float',
        label: 'B',
        length: 600,
        width: 500,
        height: 400,
        weight: 10,
        quantity: 1,
        color: '#0ea5e9',
        canRotate: true,
        stackable: true,
      },
    ]

    const result = buildManualPackingResult([floor, floating], container, cargoItems)

    expect(result.placed).toHaveLength(2)
    expect(result.placedCount).toBe(1)
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0]).toMatchObject({
      physicalLayer: 1,
      count: 1,
      minZ: 0,
      maxZ: 400,
    })
    expect(result.layers[0].labels.map((entry) => entry.label)).toEqual(['A'])
  })
})

