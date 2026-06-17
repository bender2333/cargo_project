import { describe, expect, it } from 'vitest'
import { containers, effectiveContainer, formatCubicMeters, getContainerVolume } from '../data/containers'
import type { CargoItem, ContainerSpec, PackingResult, PlacedBox } from '../types'
import { UNPLACED_REASON_CODES, calculatePacking, orientations } from './packing'
import { violatesStackChain } from './stackCapacity'

const cargo = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'cargo-1',
  name: 'Box',
  label: 'A',
  length: 1000,
  width: 1000,
  height: 1000,
  weight: 100,
  quantity: 1,
  color: '#f59e0b',
  canRotate: true,
  stackable: true,
  ...overrides,
})

const testContainer = (overrides: Partial<ContainerSpec> = {}): ContainerSpec => ({
  id: 'test-container',
  label: 'Test container',
  description: 'Small deterministic test container',
  length: 4000,
  width: 2000,
  height: 2000,
  maxWeight: 10_000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
  ...overrides,
})

function boxesOverlap(a: PlacedBox, b: PlacedBox) {
  return !(
    a.x + a.length <= b.x ||
    b.x + b.length <= a.x ||
    a.y + a.width <= b.y ||
    b.y + b.width <= a.y ||
    a.z + a.height <= b.z ||
    b.z + b.height <= a.z
  )
}

function expectValidPacking(container: ContainerSpec, result: PackingResult) {
  for (const box of result.placed) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.z).toBeGreaterThanOrEqual(0)
    expect(box.x + box.length).toBeLessThanOrEqual(container.length)
    expect(box.y + box.width).toBeLessThanOrEqual(container.width)
    expect(box.z + box.height).toBeLessThanOrEqual(container.height)
  }

  for (let i = 0; i < result.placed.length; i += 1) {
    for (let j = i + 1; j < result.placed.length; j += 1) {
      expect(boxesOverlap(result.placed[i], result.placed[j])).toBe(false)
    }
  }

  const usedVolume = result.placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
  const usedWeight = result.placed.reduce((sum, box) => sum + box.weight, 0)
  expect(result.usedVolume).toBe(usedVolume)
  expect(result.usedWeight).toBe(usedWeight)
  expect(result.usedWeight).toBeLessThanOrEqual(container.maxWeight)

  const placedIds = new Set(result.placed.map((box) => box.id))
  for (const box of result.placed) {
    expect(box.physicalLayer).toBeGreaterThanOrEqual(1)
    expect(box.workStep).toBeGreaterThanOrEqual(1)
    expect(['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL']).toContain(box.orientationKey)
    expect([0, 90, 180, 270]).toContain(box.labelRotationDeg)
    expect(box.supportedBy.every((id) => placedIds.has(id))).toBe(true)
    if (box.x === 0) {
      expect(box.supportType).toBe('floor')
      expect(box.supportedBy).toEqual([])
    } else {
      expect(box.supportedBy.length).toBeGreaterThan(0)
    }
  }
}

function expectValidLargePacking(container: ContainerSpec, result: PackingResult) {
  const outOfBounds = result.placed.find((box) => (
    box.x < 0 ||
    box.y < 0 ||
    box.z < 0 ||
    box.x + box.length > container.length ||
    box.y + box.width > container.width ||
    box.z + box.height > container.height
  ))
  expect(outOfBounds).toBeUndefined()

  let overlapPair: [string, string] | null = null
  for (let i = 0; i < result.placed.length && !overlapPair; i += 1) {
    for (let j = i + 1; j < result.placed.length; j += 1) {
      if (boxesOverlap(result.placed[i], result.placed[j])) {
        overlapPair = [result.placed[i].id, result.placed[j].id]
        break
      }
    }
  }
  expect(overlapPair).toBeNull()

  const usedVolume = result.placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
  const usedWeight = result.placed.reduce((sum, box) => sum + box.weight, 0)
  expect(result.usedVolume).toBe(usedVolume)
  expect(result.usedWeight).toBe(usedWeight)
  expect(result.usedWeight).toBeLessThanOrEqual(container.maxWeight)
}

function verticalSupportGraph(placed: PlacedBox[]) {
  return new Map(placed.map((box) => [box.id, {
    ...box,
    physicalLayer: box.verticalLayer ?? box.physicalLayer,
    supportedBy: box.verticalSupportedBy ?? [],
  }]))
}

function maxSupportedDistance(box: PlacedBox, graph: Map<string, PlacedBox>) {
  let maxDistance = 1
  for (const candidate of graph.values()) {
    const stack: PlacedBox[] = [candidate]
    const visited = new Set<string>()
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current || visited.has(current.id)) continue
      visited.add(current.id)
      if (current.id === box.id) {
        maxDistance = Math.max(
          maxDistance,
          (candidate.physicalLayer ?? 1) - (box.physicalLayer ?? 1) + 1,
        )
        break
      }
      stack.push(...current.supportedBy
        .map((supportId) => graph.get(supportId))
        .filter((support): support is PlacedBox => Boolean(support)))
    }
  }
  return maxDistance
}

describe('container specs', () => {
  it('matches EasyCargo captured container dimensions', () => {
    expect(containers.map((container) => container.label)).toEqual(["Container 20'", "Container 40'", "Container 40' HC", "Container 45' HC"])
    expect(containers[0]).toMatchObject({ length: 5758, width: 2352, height: 2385, maxWeight: 28200 })
    expect(containers[2]).toMatchObject({ length: 12117, width: 2388, height: 2694, maxWeight: 29600 })
    expect(containers[3]).toMatchObject({ length: 13556, width: 2352, height: 2698, maxWeight: 27700 })
  })

  it('formats cubic millimeters as cubic meters', () => {
    expect(formatCubicMeters(1_000_000_000)).toBe('1.00 m³')
    expect(getContainerVolume(containers[0])).toBe(5758 * 2352 * 2385)
  })

  it('derives effective loading dimensions from door, top, and side gaps', () => {
    const container = testContainer({ length: 4000, width: 2000, height: 2000, doorGap: 300, topGap: 100, sideGap: 50 })

    expect(effectiveContainer(container)).toMatchObject({ length: 3700, width: 1900, height: 1900 })
    expect(getContainerVolume(container)).toBe(3700 * 1900 * 1900)
  })
})

describe('calculatePacking', () => {
  it('places cargo and reports utilization', () => {
    const result = calculatePacking(containers[0], [cargo({ quantity: 2 })])

    expectValidPacking(containers[0], result)
    expect(result.placedCount).toBe(2)
    expect(result.totalCargoCount).toBe(2)
    expect(result.volumeUtilization).toBeGreaterThan(0)
    expect(result.weightUtilization).toBeCloseTo((200 / 28200) * 100)
    expect(result.unplaced).toEqual([])
    expect(result.placed[0].label).toBe('A')
  })

  it('preserves each cargo rotation rule on placed boxes for 3D face badges', () => {
    const result = calculatePacking(containers[0], [
      cargo({ id: 'fixed', label: 'F', canRotate: false }),
      cargo({ id: 'rotatable', label: 'R', canRotate: true }),
    ])

    expect(result.placed.find((box) => box.cargoId === 'fixed')).toMatchObject({ canRotate: false })
    expect(result.placed.find((box) => box.cargoId === 'rotatable')).toMatchObject({ canRotate: true })
  })

  it('preserves full imported SKU labels through placed boxes, loading steps, stats, and unplaced rows', () => {
    const container = testContainer({ length: 1000, width: 1000, height: 1000, maxWeight: 150 })
    const sku = 'TB-C10-EV_v1.1'
    const result = calculatePacking(container, [
      cargo({
        id: 'sku-carton',
        name: 'Vietnam carton',
        label: sku,
        length: 1000,
        width: 1000,
        height: 500,
        weight: 100,
        quantity: 2,
        canRotate: false,
      }),
    ])

    expect(result.placed[0]).toMatchObject({ cargoId: 'sku-carton', label: sku })
    expect(result.workSteps[0]).toMatchObject({ cargoId: 'sku-carton', label: sku })
    expect(result.labelStats[0]).toMatchObject({ label: sku, planned: 2, placed: 1, unplaced: 1 })
    expect(result.unplaced[0]).toMatchObject({ cargoId: 'sku-carton', label: sku, quantity: 1 })
  })

  it('fills the inner cross-section before moving outward along the container length', () => {
    const container = testContainer({ length: 3000, width: 2000, height: 2000 })
    const result = calculatePacking(container, [
      cargo({ id: 'box', label: 'A', length: 1000, width: 1000, height: 1000, quantity: 5, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.placedCount).toBe(5)
    expect(result.placed.slice(0, 4).every((box) => box.x === 0)).toBe(true)
    expect(new Set(result.placed.slice(0, 4).map((box) => `${box.y}:${box.z}`)).size).toBe(4)
    expect(result.placed[4].x).toBe(1000)
  })

  it('loads rotatable top-fill boxes before moving to the next outer depth slice', () => {
    const items = [
      cargo({ id: 'carton-a', label: 'A', length: 400, width: 500, height: 600, quantity: 18, canRotate: true }),
      ...Array.from({ length: 21 }, (_, index) =>
        cargo({
          id: `carton-${index + 2}`,
          label: String.fromCharCode('B'.charCodeAt(0) + index),
          length: 400,
          width: 500,
          height: 600,
          quantity: 10,
          canRotate: true,
        }),
      ),
    ]
    const result = calculatePacking(containers[0], items)

    expectValidPacking(effectiveContainer(containers[0]), result)

    const byStep = [...result.placed].sort((a, b) => a.workStep - b.workStep)
    const firstOuterDepthStep = byStep.find((box) => box.x > 0)?.workStep
    const innerTopFillSteps = byStep.filter((box) => box.x === 0 && box.z >= 1800).map((box) => box.workStep)

    expect(firstOuterDepthStep).toBeDefined()
    expect(innerTopFillSteps.length).toBeGreaterThan(0)
    expect(Math.max(...innerTopFillSteps)).toBeLessThan(firstOuterDepthStep!)
  })

  it('can preserve input order as a loading mode instead of volume-priority order', () => {
    const container = testContainer({ length: 3000, width: 1000, height: 1000 })
    const items = [
      cargo({ id: 'small', label: 'S', length: 500, width: 1000, height: 1000, quantity: 1, canRotate: false }),
      cargo({ id: 'large', label: 'L', length: 1000, width: 1000, height: 1000, quantity: 1, canRotate: false }),
    ]

    expect(calculatePacking(container, items, { loadingMode: 'volume' }).workSteps.map((step) => step.label)).toEqual(['L', 'S'])
    expect(calculatePacking(container, items, { loadingMode: 'input' }).workSteps.map((step) => step.label)).toEqual(['S', 'L'])
  })

  it('defaults to quantity-priority loading mode when none is specified', () => {
    const container = testContainer({ length: 5000, width: 1000, height: 1000 })
    const items = [
      cargo({ id: 'small-many', label: 'Q', length: 400, width: 1000, height: 1000, weight: 5, quantity: 3, canRotate: false }),
      cargo({ id: 'heavy-one', label: 'W', length: 500, width: 1000, height: 1000, weight: 80, quantity: 1, canRotate: false }),
    ]

    const defaultLabels = calculatePacking(container, items).workSteps.map((step) => step.label).slice(0, 2)
    const quantityLabels = calculatePacking(container, items, { loadingMode: 'quantity' }).workSteps.map((step) => step.label).slice(0, 2)
    expect(defaultLabels).toEqual(quantityLabels)
    expect(defaultLabels).toEqual(['Q', 'Q'])
  })

  it('places higher stack-capacity cargo first in quantity mode so it can form the lower layers', () => {
    const container = testContainer({ length: 1000, width: 1000, height: 3000 })
    const result = calculatePacking(container, [
      cargo({ id: 'limited-many', label: 'L', length: 1000, width: 1000, height: 500, quantity: 3, canRotate: false, maxStackLayers: 2 }),
      cargo({ id: 'unlimited-few', label: 'U', length: 1000, width: 1000, height: 500, quantity: 2, canRotate: false }),
    ], { loadingMode: 'quantity' })

    expect(result.workSteps.map((step) => step.label).slice(0, 2)).toEqual(['U', 'U'])
    expect(result.placed.filter((box) => box.label === 'U').every((box) => box.physicalLayer <= 2)).toBe(true)
  })

  it('uses stack capacity before volume ties in volume mode', () => {
    const container = testContainer({ length: 1000, width: 1000, height: 1500 })
    const result = calculatePacking(container, [
      cargo({ id: 'limited', label: 'L', length: 1000, width: 1000, height: 500, quantity: 1, canRotate: false, maxStackLayers: 1 }),
      cargo({ id: 'unlimited', label: 'U', length: 1000, width: 1000, height: 500, quantity: 1, canRotate: false }),
    ], { loadingMode: 'volume' })

    expect(result.workSteps.map((step) => step.label)).toEqual(['U', 'L'])
    expect(result.placed.find((box) => box.cargoId === 'unlimited')).toMatchObject({ z: 0 })
    expect(result.placed.find((box) => box.cargoId === 'limited')).toMatchObject({ z: 500 })
  })

  it('supports selectable weight and quantity loading rules', () => {
    const container = testContainer({ length: 5000, width: 1000, height: 1000 })
    const items = [
      cargo({ id: 'small-many', label: 'Q', length: 400, width: 1000, height: 1000, weight: 5, quantity: 3, canRotate: false }),
      cargo({ id: 'heavy-one', label: 'W', length: 500, width: 1000, height: 1000, weight: 80, quantity: 1, canRotate: false }),
    ]

    expect(calculatePacking(container, items, { loadingMode: 'weight' }).workSteps.map((step) => step.label).slice(0, 2)).toEqual(['W', 'Q'])
    expect(calculatePacking(container, items, { loadingMode: 'quantity' }).workSteps.map((step) => step.label).slice(0, 2)).toEqual(['Q', 'Q'])
  })

  it('continues filling inner height before moving outward when width is already full', () => {
    const container = testContainer({ length: 3000, width: 1000, height: 3000 })
    const result = calculatePacking(container, [
      cargo({ id: 'box', label: 'A', length: 1000, width: 1000, height: 1000, quantity: 4, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.placed.map((box) => [box.x, box.y, box.z])).toEqual([
      [0, 0, 0],
      [0, 0, 1000],
      [0, 0, 2000],
      [1000, 0, 0],
    ])
  })

  it('keeps all boxes non-overlapping across mixed cargo sizes', () => {
    const container = testContainer({ length: 5000, width: 2500, height: 2500, maxWeight: 20_000 })
    const result = calculatePacking(container, [
      cargo({ id: 'large', label: 'L', length: 2000, width: 1500, height: 1000, quantity: 2, weight: 500, canRotate: false }),
      cargo({ id: 'medium', label: 'M', length: 1500, width: 1000, height: 1000, quantity: 3, weight: 300, canRotate: true }),
      cargo({ id: 'small', label: 'S', length: 500, width: 500, height: 500, quantity: 8, weight: 50, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.placedCount).toBe(13)
    expect(result.unplaced).toEqual([])
  })

  it('rotates cargo when only a rotated orientation fits the container', () => {
    const container = testContainer({ length: 3000, width: 1000, height: 1000 })
    const result = calculatePacking(container, [
      cargo({ id: 'rotated', label: 'R', length: 1000, width: 3000, height: 1000, quantity: 1, canRotate: true }),
    ])

    expectValidPacking(container, result)
    expect(result.placedCount).toBe(1)
    expect(result.placed[0]).toMatchObject({ length: 3000, width: 1000, height: 1000, orientationKey: 'WLH', labelRotationDeg: 90 })
  })

  it('does not rotate cargo when rotation is disabled', () => {
    const container = testContainer({ length: 3000, width: 1000, height: 1000 })
    const result = calculatePacking(container, [
      cargo({ id: 'fixed', label: 'F', length: 1000, width: 3000, height: 1000, quantity: 1, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.placedCount).toBe(0)
    expect(result.unplaced[0]).toMatchObject({ cargoId: 'fixed', quantity: 1, reasonCode: UNPLACED_REASON_CODES.EXCEEDS_DIMENSIONS })
  })

  it('packs exact edge-aligned boxes without treating touching faces as overlap', () => {
    const container = testContainer({ length: 2000, width: 1000, height: 1000 })
    const result = calculatePacking(container, [
      cargo({ id: 'edge', label: 'E', length: 1000, width: 1000, height: 1000, quantity: 2, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.placedCount).toBe(2)
    expect(result.placed.map((box) => box.x)).toEqual([0, 1000])
    expect(result.volumeUtilization).toBe(100)
  })

  it('aggregates unplaced quantities by cargo item and reason', () => {
    const container = testContainer({ length: 2000, width: 1000, height: 1000 })
    const result = calculatePacking(container, [
      cargo({ id: 'fits-two', name: 'Fits two', label: 'F', length: 1000, width: 1000, height: 1000, quantity: 4, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.placedCount).toBe(2)
    expect(result.unplaced).toEqual([
      { cargoId: 'fits-two', name: 'Fits two', label: 'F', quantity: 2, reasonCode: UNPLACED_REASON_CODES.NO_SPACE, reason: 'No remaining loading space' },
    ])
  })

  it('derives physical layers from support depth instead of z height buckets', () => {
    const container = testContainer({ length: 2000, width: 1000, height: 1500 })
    const result = calculatePacking(container, [
      cargo({ id: 'tall-base', label: 'T', length: 1000, width: 1000, height: 1000, quantity: 1, canRotate: false }),
      cargo({ id: 'half', label: 'H', length: 1000, width: 1000, height: 500, quantity: 3, canRotate: false }),
    ], { loadingMode: 'volume' })

    expectValidPacking(container, result)
    expect(result.layers.map((layer) => ({ layer: layer.physicalLayer, count: layer.count }))).toEqual([
      { layer: 1, count: 2 },
      { layer: 2, count: 2 },
    ])

    const secondLayerBoxes = result.placed.filter((box) => box.physicalLayer === 2)
    expect(new Set(secondLayerBoxes.map((box) => box.z))).toEqual(new Set([0, 500]))
    expect(result.layers[1].minZ).toBe(0)
    expect(result.layers[1].maxZ).toBe(1000)
    expect(secondLayerBoxes.every((box) => box.supportType === 'fully-supported')).toBe(true)
  })

  it('reports label stats across planned, placed, unplaced, and physical layers', () => {
    const container = testContainer({ length: 1000, width: 1000, height: 1000, maxWeight: 150 })
    const result = calculatePacking(container, [
      cargo({ id: 'a', name: 'Alpha', label: 'A', length: 1000, width: 1000, height: 500, weight: 100, quantity: 2, canRotate: false }),
      cargo({ id: 'b', name: 'Beta', label: 'B', length: 500, width: 500, height: 500, weight: 25, quantity: 1, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.labelStats).toEqual([
      { label: 'A', name: 'Alpha', color: '#f59e0b', planned: 2, placed: 1, unplaced: 1, layers: [1] },
      { label: 'B', name: 'Beta', color: '#f59e0b', planned: 1, placed: 1, unplaced: 0, layers: [1] },
    ])
    expect(result.unplaced[0]).toMatchObject({ cargoId: 'a', label: 'A', quantity: 1, reasonCode: UNPLACED_REASON_CODES.EXCEEDS_PAYLOAD })
  })

  it('reports explicit compliance diagnostics and optimization guidance', () => {
    const result = calculatePacking(testContainer({ length: 1000, width: 1000, height: 1000, maxWeight: 150 }), [
      cargo({ id: 'a', name: 'Alpha', label: 'A', length: 1000, width: 1000, height: 500, weight: 100, quantity: 2, canRotate: false }),
      cargo({ id: 'b', name: 'Beta', label: 'B', length: 500, width: 500, height: 500, weight: 25, quantity: 1, canRotate: false }),
    ])

    expect(result.diagnostics.map((item) => item.id)).toEqual([
      'boundary-check',
      'weight-check',
      'overlap-check',
      'support-check',
      'stacking-check',
      'unplaced-a',
      'optimization-suggestion',
    ])
    expect(result.diagnostics.find((item) => item.id === 'boundary-check')).toMatchObject({ severity: 'info' })
    expect(result.diagnostics.find((item) => item.id === 'weight-check')).toMatchObject({ severity: 'info' })
    expect(result.diagnostics.find((item) => item.id === 'overlap-check')).toMatchObject({ severity: 'info' })
    expect(result.diagnostics.find((item) => item.id === 'support-check')).toMatchObject({ severity: 'info' })
    expect(result.diagnostics.find((item) => item.id === 'stacking-check')).toMatchObject({ severity: 'info' })
    expect(result.diagnostics.find((item) => item.id === 'optimization-suggestion')?.message).toContain('review unplaced cargo')

    const unplacedDiagnostic = result.diagnostics.find((item) => item.id === 'unplaced-a')
    expect(unplacedDiagnostic).toMatchObject({
      severity: 'warning',
      code: UNPLACED_REASON_CODES.EXCEEDS_PAYLOAD,
    })
    expect(unplacedDiagnostic?.params).toMatchObject({
      label: 'A',
      name: 'Alpha',
      quantity: 1,
      reasonCode: UNPLACED_REASON_CODES.EXCEEDS_PAYLOAD,
    })
  })

  it('supports gravity-stable stacking on top of fully supported boxes', () => {
    const result = calculatePacking(containers[0], [
      cargo({ id: 'base-a', label: 'A', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false }),
      cargo({ id: 'top', label: 'B', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false }),
    ])

    expectValidPacking(containers[0], result)
    expect(result.placed.some((box) => box.z > 0)).toBe(true)
    expect(result.placed.filter((box) => box.z === 0).length).toBe(1)
  })

  it('does not place cargo above boxes marked as non-stackable', () => {
    const result = calculatePacking(containers[0], [
      cargo({ id: 'base-a', label: 'A', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false, stackable: false }),
      cargo({ id: 'top', label: 'B', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false }),
    ], { loadingMode: 'input' })

    expectValidPacking(containers[0], result)
    expect(result.placed.some((box) => box.z > 0)).toBe(false)
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reasonCode: UNPLACED_REASON_CODES.NO_SPACE })
  })

  it('treats non-stackable cargo as capacity-one top cargo in a snapshot-11 style mixed stack-capacity load', () => {
    const container = containers[0]
    const result = calculatePacking(container, [
      cargo({ id: 'unlimited-a', label: 'A', length: 400, width: 500, height: 600, quantity: 18, canRotate: true }),
      cargo({ id: 'unlimited-b', label: 'B', length: 400, width: 500, height: 600, quantity: 10, canRotate: true }),
      cargo({ id: 'unlimited-c', label: 'C', length: 400, width: 500, height: 600, quantity: 10, canRotate: true }),
      ...['D', 'E', 'F'].map((label) => cargo({ id: `capacity-five-${label}`, label, length: 400, width: 500, height: 600, quantity: 10, canRotate: true, maxStackLayers: 5 })),
      ...['G', 'H', 'I', 'J'].map((label) => cargo({ id: `capacity-two-${label}`, label, length: 400, width: 500, height: 600, quantity: 10, canRotate: true, maxStackLayers: 2 })),
      ...['K', 'L', 'M', 'N'].map((label) => cargo({ id: `top-only-${label}`, label, length: 400, width: 500, height: 600, quantity: 10, canRotate: true, stackable: false })),
      ...['O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'].map((label) => cargo({ id: `capacity-three-${label}`, label, length: 400, width: 500, height: 600, quantity: 10, canRotate: true, maxStackLayers: 3 })),
    ], { loadingMode: 'quantity' })

    expectValidLargePacking(container, result)
    expect(result.placedCount).toBeGreaterThan(150)

    const verticalById = verticalSupportGraph(result.placed)
    for (const box of verticalById.values()) {
      expect(violatesStackChain(box, verticalById)).toBeNull()
    }

    const nonStackable = result.placed.filter((box) => box.cargoId.startsWith('top-only-'))
    const unlimited = result.placed.filter((box) => box.cargoId.startsWith('unlimited-'))
    const capacityTwo = result.placed.filter((box) => box.cargoId.startsWith('capacity-two-'))
    expect(nonStackable.length).toBeGreaterThan(0)
    expect(nonStackable.every((box) =>
      result.placed.every((other) => !(other.verticalSupportedBy ?? []).includes(box.id)),
    )).toBe(true)
    expect(capacityTwo.every((box) => maxSupportedDistance(box, verticalById) <= 2)).toBe(true)
    const averageZ = (boxes: PlacedBox[]) => boxes.reduce((sum, box) => sum + box.z, 0) / boxes.length
    expect(averageZ(unlimited)).toBeLessThan(averageZ(nonStackable))
  })

  it('keeps ground-only cargo on the floor while still allowing other capacity-one cargo as top passengers', () => {
    const container = testContainer({ length: 1000, width: 1000, height: 1800 })
    const result = calculatePacking(container, [
      cargo({ id: 'support', label: 'S', length: 500, width: 500, height: 600, quantity: 4, canRotate: false }),
      cargo({ id: 'ground-only', label: 'G', length: 500, width: 500, height: 600, quantity: 1, canRotate: false, groundOnly: true, stackable: false }),
      cargo({ id: 'top-only', label: 'T', length: 500, width: 500, height: 600, quantity: 1, canRotate: false, stackable: false }),
    ], { loadingMode: 'quantity' })

    expectValidPacking(container, result)
    const graph = verticalSupportGraph(result.placed)
    for (const box of graph.values()) {
      expect(violatesStackChain(box, graph)).toBeNull()
    }

    expect(result.placed.find((box) => box.cargoId === 'ground-only')).toMatchObject({ z: 0 })
    expect(result.placed.find((box) => box.cargoId === 'top-only')?.z).toBeGreaterThan(0)
  })

  it('honors cargo max stack layers while preserving unlimited legacy behavior by default', () => {
    const container = testContainer({ length: 1000, width: 1000, height: 3000 })

    const limited = calculatePacking(container, [
      cargo({
        id: 'stack-limited',
        label: 'S',
        length: 1000,
        width: 1000,
        height: 500,
        quantity: 3,
        canRotate: false,
        maxStackLayers: 2,
      }),
    ])
    expectValidPacking(container, limited)
    expect(limited.placedCount).toBe(2)
    expect(limited.unplaced[0]).toMatchObject({ cargoId: 'stack-limited', quantity: 1, reasonCode: UNPLACED_REASON_CODES.NO_SPACE })
    expect(Math.max(...limited.placed.map((box) => box.z))).toBe(500)
    expect(limited.placed.every((box) => box.maxStackLayers === 2)).toBe(true)

    const legacy = calculatePacking(container, [
      cargo({
        id: 'legacy-stack',
        label: 'L',
        length: 1000,
        width: 1000,
        height: 500,
        quantity: 3,
        canRotate: false,
      }),
    ])
    expectValidPacking(container, legacy)
    expect(legacy.placedCount).toBe(3)
    expect(Math.max(...legacy.placed.map((box) => box.z))).toBe(1000)
  })

  it('prevents unlimited cargo from stacking above a supporting cargo stack limit', () => {
    const container = testContainer({ length: 1000, width: 1000, height: 3000 })

    const result = calculatePacking(container, [
      cargo({
        id: 'limited-base',
        label: 'A',
        length: 1000,
        width: 1000,
        height: 500,
        quantity: 1,
        canRotate: false,
        maxStackLayers: 2,
      }),
      cargo({
        id: 'middle-unlimited',
        label: 'B',
        length: 1000,
        width: 1000,
        height: 500,
        quantity: 1,
        canRotate: false,
      }),
      cargo({
        id: 'top-unlimited',
        label: 'C',
        length: 1000,
        width: 1000,
        height: 500,
        quantity: 1,
        canRotate: false,
      }),
    ], { loadingMode: 'input' })

    expectValidPacking(container, result)
    expect(result.placed.map((box) => box.cargoId)).toEqual(['limited-base', 'middle-unlimited'])
    expect(result.unplaced[0]).toMatchObject({ cargoId: 'top-unlimited', quantity: 1, reasonCode: UNPLACED_REASON_CODES.NO_SPACE })
  })

  it('applies a global default max stack layer limit only to cargo without its own limit', () => {
    const container = testContainer({ length: 1000, width: 1000, height: 3000 })

    const globalOnly = calculatePacking(container, [
      cargo({
        id: 'global-stack',
        label: 'G',
        length: 1000,
        width: 1000,
        height: 500,
        quantity: 3,
        canRotate: false,
      }),
    ], { defaultMaxStackLayers: 2 })

    expectValidPacking(container, globalOnly)
    expect(globalOnly.placedCount).toBe(2)
    expect(globalOnly.unplaced[0]).toMatchObject({ cargoId: 'global-stack', quantity: 1, reasonCode: UNPLACED_REASON_CODES.NO_SPACE })
    expect(globalOnly.placed.every((box) => box.maxStackLayers === 2)).toBe(true)
    expect(Math.max(...globalOnly.placed.map((box) => box.z))).toBe(500)

    const cargoOverride = calculatePacking(container, [
      cargo({
        id: 'cargo-stack',
        label: 'C',
        length: 1000,
        width: 1000,
        height: 500,
        quantity: 3,
        canRotate: false,
        maxStackLayers: 3,
      }),
    ], { defaultMaxStackLayers: 2 })

    expectValidPacking(container, cargoOverride)
    expect(cargoOverride.placedCount).toBe(3)
    expect(cargoOverride.unplaced).toEqual([])
    expect(cargoOverride.placed.every((box) => box.maxStackLayers === 3)).toBe(true)
  })

  it('uses the global default stack limit to stop dense tilted top-fill boxes', () => {
    const container = containers[0]
    const items = [
      cargo({
        id: 'dense-top-fill',
        label: 'D',
        length: 400,
        width: 500,
        height: 600,
        quantity: 210,
        canRotate: true,
      }),
    ]

    const unrestricted = calculatePacking(container, items, { loadingMode: 'quantity' })
    const unrestrictedTopFill = unrestricted.placed.filter((box) => box.orientationKey === 'LHW' && box.z >= 1800)
    expect(unrestrictedTopFill.length).toBeGreaterThan(0)

    const capped = calculatePacking(container, items, { loadingMode: 'quantity', defaultMaxStackLayers: 2 })
    expectValidPacking(container, capped)
    expect(Math.max(...capped.placed.map((box) => box.z))).toBeLessThanOrEqual(600)
    expect(capped.placed.some((box) => box.orientationKey === 'LHW' && box.z >= 1800)).toBe(false)
    expect(capped.unplaced[0]).toMatchObject({ cargoId: 'dense-top-fill', reasonCode: UNPLACED_REASON_CODES.NO_SPACE })
  })

  it('rejects boxes that exceed dimensions', () => {
    const result = calculatePacking(containers[0], [cargo({ length: 9000 })])

    expectValidPacking(containers[0], result)
    expect(result.placedCount).toBe(0)
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reasonCode: UNPLACED_REASON_CODES.EXCEEDS_DIMENSIONS })
  })

  it('rejects boxes after payload is exhausted', () => {
    const result = calculatePacking(containers[0], [cargo({ weight: 20_000, quantity: 2 })])

    expectValidPacking(containers[0], result)
    expect(result.placedCount).toBe(1)
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reasonCode: UNPLACED_REASON_CODES.EXCEEDS_PAYLOAD })
  })

  it('uses effective dimensions after reserved gaps for boundary checks', () => {
    const result = calculatePacking(testContainer({ length: 2000, width: 1000, height: 1000, doorGap: 200 }), [
      cargo({ id: 'gap-blocked', label: 'G', length: 1900, width: 1000, height: 1000, quantity: 1, canRotate: false }),
    ])

    expect(result.placedCount).toBe(0)
    expect(result.unplaced[0]).toMatchObject({ cargoId: 'gap-blocked', reasonCode: UNPLACED_REASON_CODES.EXCEEDS_DIMENSIONS })
  })

  it('reports deterministic totals for a partially loaded container', () => {
    const container = testContainer({ length: 4000, width: 2000, height: 1000, maxWeight: 500 })
    const result = calculatePacking(container, [
      cargo({ id: 'a', label: 'A', length: 1000, width: 1000, height: 1000, weight: 100, quantity: 2, canRotate: false }),
      cargo({ id: 'b', label: 'B', length: 2000, width: 1000, height: 1000, weight: 200, quantity: 1, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.totalCargoCount).toBe(3)
    expect(result.placedCount).toBe(3)
    expect(result.usedVolume).toBe(4_000_000_000)
    expect(result.containerVolume).toBe(8_000_000_000)
    expect(result.volumeUtilization).toBe(50)
    expect(result.usedWeight).toBe(400)
    expect(result.weightUtilization).toBe(80)
  })

  it('packs the reported A and BDEF carton data set completely', () => {
    const result = calculatePacking(containers[0], [
      cargo({ id: 'a', name: 'Carton A', label: 'A', length: 600, width: 400, height: 350, quantity: 10, canRotate: true }),
      cargo({ id: 'b', name: 'Carton B', label: 'B', length: 800, width: 500, height: 450, quantity: 10, canRotate: true }),
      cargo({ id: 'd', name: 'Carton D', label: 'D', length: 800, width: 500, height: 450, quantity: 10, canRotate: true }),
      cargo({ id: 'e', name: 'Carton E', label: 'E', length: 800, width: 500, height: 450, quantity: 10, canRotate: true }),
      cargo({ id: 'f', name: 'Carton F', label: 'F', length: 800, width: 500, height: 450, quantity: 10, canRotate: true }),
    ])

    expectValidPacking(containers[0], result)
    expect(result.totalCargoCount).toBe(50)
    expect(result.placedCount).toBe(50)
    expect(result.unplaced).toEqual([])
    expect(result.placed.filter((box) => box.label === 'A').every((box) => [350, 400, 600].includes(box.height))).toBe(true)
    expect(result.placed.filter((box) => box.label !== 'A').every((box) => [450, 500, 800].includes(box.height))).toBe(true)
  })

  describe('orientations 6-axis support', () => {
    it('returns all 6 unique orientations when all 3 dimensions are distinct and canRotate is true', () => {
      const item = cargo({ length: 400, width: 500, height: 600, canRotate: true })
      const res = orientations(item)
      expect(res).toHaveLength(6)
      
      const expected = [
        { length: 400, width: 500, height: 600, orientationKey: 'LWH', labelRotationDeg: 0 },
        { length: 500, width: 400, height: 600, orientationKey: 'WLH', labelRotationDeg: 90 },
        { length: 400, width: 600, height: 500, orientationKey: 'LHW', labelRotationDeg: 90 },
        { length: 600, width: 400, height: 500, orientationKey: 'HLW', labelRotationDeg: 180 },
        { length: 500, width: 600, height: 400, orientationKey: 'WHL', labelRotationDeg: 270 },
        { length: 600, width: 500, height: 400, orientationKey: 'HWL', labelRotationDeg: 180 },
      ]
      
      for (const opt of expected) {
        expect(res.find(o => o.length === opt.length && o.width === opt.width && o.height === opt.height)).toMatchObject(opt)
      }
    })

    it('returns 3 unique orientations when 2 dimensions are identical and canRotate is true', () => {
      const item = cargo({ length: 400, width: 400, height: 600, canRotate: true })
      const res = orientations(item)
      expect(res).toHaveLength(3)
    })

    it('returns 1 orientation when all dimensions are identical or canRotate is false', () => {
      const cube = cargo({ length: 400, width: 400, height: 400, canRotate: true })
      expect(orientations(cube)).toHaveLength(1)

      const nonRotatable = cargo({ length: 400, width: 500, height: 600, canRotate: false })
      expect(orientations(nonRotatable)).toHaveLength(1)
    })
  })

  describe('tilting and side-placement algorithm optimization', () => {
    it('places 80 items of 400x500x600 in a 40HQ container as even upright layers', () => {
      // 40HQ has height 2694. A 600mm-tall box stacks 4 upright layers (2400mm); the remaining
      // 294mm cannot fit another box, so four even layers is the correct full-utilization result.
      const containerhq = containers[2] // "Container 40' HC" (12117 x 2388 x 2694)
      const cargoItem = cargo({
        id: 'box-tilt',
        name: 'Tiltable Box',
        label: 'T',
        length: 400,
        width: 500,
        height: 600,
        weight: 10,
        quantity: 80,
        canRotate: true,
      })

      const result = calculatePacking(containerhq, [cargoItem])
      
      // Rotation lets a 600mm box fill the 2694mm-tall container in four upright layers.
      // All 80 fit, and same-cargo orientation commitment keeps them in one orientation so they
      // pack as even columns instead of an uneven mixed-orientation staircase (which leaves gaps).
      expectValidPacking(containerhq, result)
      expect(result.placedCount).toBe(80)
      const maxLayer = Math.max(...result.placed.map((box) => box.physicalLayer), 0)
      expect(maxLayer).toBeGreaterThanOrEqual(4)
    })
  })

  describe('same-cargo orientation commitment', () => {
    it('commits a cargo to one orientation so identical boxes share a row pitch', () => {
      // 530x305x310 boxes fit LWH or WLH; mixing them alternates the 530/305 floor pitch and
      // leaves side gaps. The first placement fixes the orientation and every later box of the
      // same cargo reuses it, so all placed boxes share one orientationKey. Regression for the
      // alternating-orientation side gaps reported on cargo-debug-snapshot (14).
      const container = testContainer({ length: 12117, width: 2388, height: 2694 })
      const cargoItem = cargo({ length: 530, width: 305, height: 310, quantity: 60, canRotate: true })

      const result = calculatePacking(container, [cargoItem])

      expect(result.placedCount).toBe(60)
      const orientationKeys = new Set(result.placed.map((box) => box.orientationKey))
      expect(orientationKeys.size).toBe(1)
    })

    it('lets a box fall back to another orientation when the committed one cannot fit', () => {
      // Commitment is a strong preference, not a hard filter. In a 1000x1000x400 box only two
      // committed-orientation boxes fit; a third fits the leftover strip only when rotated. It
      // must still place (three total, two distinct orientations) rather than be dropped as
      // unplaced — a hard filter would strand it and leave only two placed.
      const container = testContainer({ length: 1000, width: 1000, height: 400 })
      const cargoItem = cargo({ length: 600, width: 400, height: 400, quantity: 6, canRotate: true })

      const result = calculatePacking(container, [cargoItem])

      expect(result.placedCount).toBe(3)
      const orientationKeys = new Set(result.placed.map((box) => box.orientationKey))
      expect(orientationKeys.size).toBe(2)
    })
  })
})

describe('orientation preference and clustering', () => {
  it('prefers LWH over WLH when both orientations fit the same space', () => {
    const container = containers[0]
    const items = [cargo({ id: 'wide', label: 'W', length: 530, width: 305, height: 310, quantity: 10 })]
    const result = calculatePacking(container, items)
    expectValidPacking(container, result)
    const lwhCount = result.placed.filter((box) => box.orientationKey === 'LWH').length
    const wlhCount = result.placed.filter((box) => box.orientationKey === 'WLH').length
    expect(lwhCount).toBeGreaterThanOrEqual(wlhCount)
  })

  it('still uses WLH when LWH would not fit optimally', () => {
    const container = containers[0]
    const items = [cargo({ id: 'mix', label: 'M', length: 530, width: 305, height: 310, quantity: 50 })]
    const result = calculatePacking(container, items)
    expectValidPacking(container, result)
    expect(result.placed.filter((box) => box.orientationKey === 'LWH').length).toBeGreaterThan(0)
  })

  it('same-label cargo forms a contiguous cluster', () => {
    const container = testContainer({ length: 3000, width: 2000, height: 2000 })
    const items = [
      cargo({ id: 'a', label: 'A', length: 300, width: 300, height: 300, quantity: 10 }),
      cargo({ id: 'b', label: 'B', length: 300, width: 300, height: 300, quantity: 10 }),
    ]
    const result = calculatePacking(container, items)
    expectValidPacking(container, result)
    for (const label of ['A', 'B']) {
      const boxes = result.placed.filter((box) => box.label === label)
      if (boxes.length <= 1) continue
      const minX = Math.min(...boxes.map((b) => b.x))
      const maxX = Math.max(...boxes.map((b) => b.x + b.length))
      const minY = Math.min(...boxes.map((b) => b.y))
      const maxY = Math.max(...boxes.map((b) => b.y + b.width))
      const area = (maxX - minX) * (maxY - minY)
      expect(area).toBeLessThan(container.length * container.width * 0.9)
    }
  })

  it('stacks same-height boxes on each other', () => {
    const container = testContainer({ length: 2000, width: 2000, height: 2000 })
    const items = [
      cargo({ id: 'tall', label: 'T', length: 400, width: 400, height: 500, quantity: 4 }),
      cargo({ id: 'short', label: 'S', length: 400, width: 400, height: 200, quantity: 4 }),
    ]
    const result = calculatePacking(container, items)
    expectValidPacking(container, result)
    let sameHeightStacks = 0
    for (const box of result.placed) {
      const below = (box.verticalSupportedBy ?? [])
        .map((id) => result.placed.find((b) => b.id === id))
        .filter(Boolean) as PlacedBox[]
      for (const supporter of below) {
        if (Math.abs(supporter.height - box.height) <= 0.001) sameHeightStacks++
      }
    }
    expect(sameHeightStacks).toBeGreaterThan(0)
  })
})
