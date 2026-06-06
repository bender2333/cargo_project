import { describe, expect, it } from 'vitest'
import { containers, effectiveContainer, formatCubicMeters, getContainerVolume } from '../data/containers'
import type { CargoItem, ContainerSpec, PackingResult, PlacedBox } from '../types'
import { UNPLACED_REASON_CODES, calculatePacking, orientations } from './packing'

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

  it('does not stack on boxes marked as non-stackable', () => {
    const result = calculatePacking(containers[0], [
      cargo({ id: 'base-a', label: 'A', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false, stackable: false }),
      cargo({ id: 'top', label: 'B', length: containers[0].length, width: containers[0].width, height: 500, quantity: 1, canRotate: false }),
    ])

    expectValidPacking(containers[0], result)
    expect(result.placed.some((box) => box.z > 0)).toBe(false)
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reasonCode: UNPLACED_REASON_CODES.NO_SPACE })
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
    it('places 80 items of 400x500x600 in 40HQ container, ensuring higher stack layers via tilting', () => {
      // 40HQ has height 2694. With 600mm height, we can stack 4 layers (2400mm). 
      // With tilting, we can use 400mm or 500mm height, e.g., 5 layers of 500mm (2500mm) or 6 layers of 400mm (2400mm).
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
      
      // Let's verify we placed many of them
      expectValidPacking(containerhq, result)
      expect(result.placedCount).toBeGreaterThanOrEqual(50)
      
      // Let's check the maximum physical layers. With tilting, it should reach at least 5 layers
      const maxLayer = Math.max(...result.placed.map((box) => box.physicalLayer), 0)
      expect(maxLayer).toBeGreaterThanOrEqual(5)
    })
  })
})
