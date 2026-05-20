import { describe, expect, it } from 'vitest'
import { containers, effectiveContainer, formatCubicMeters, getContainerVolume } from '../data/containers'
import type { CargoItem, ContainerSpec, PackingResult, PlacedBox } from '../types'
import { calculatePacking } from './packing'

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
    expect(box.supportedBy.every((id) => placedIds.has(id))).toBe(true)
    if (box.z === 0) {
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

  it('can preserve input order as a loading mode instead of volume-priority order', () => {
    const container = testContainer({ length: 3000, width: 1000, height: 1000 })
    const items = [
      cargo({ id: 'small', label: 'S', length: 500, width: 1000, height: 1000, quantity: 1, canRotate: false }),
      cargo({ id: 'large', label: 'L', length: 1000, width: 1000, height: 1000, quantity: 1, canRotate: false }),
    ]

    expect(calculatePacking(container, items).workSteps.map((step) => step.label)).toEqual(['L', 'S'])
    expect(calculatePacking(container, items, { loadingMode: 'input' }).workSteps.map((step) => step.label)).toEqual(['S', 'L'])
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
    expect(result.placed[0]).toMatchObject({ length: 3000, width: 1000, height: 1000 })
  })

  it('does not rotate cargo when rotation is disabled', () => {
    const container = testContainer({ length: 3000, width: 1000, height: 1000 })
    const result = calculatePacking(container, [
      cargo({ id: 'fixed', label: 'F', length: 1000, width: 3000, height: 1000, quantity: 1, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.placedCount).toBe(0)
    expect(result.unplaced[0]).toMatchObject({ cargoId: 'fixed', quantity: 1, reason: 'Exceeds container dimensions' })
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
      { cargoId: 'fits-two', name: 'Fits two', label: 'F', quantity: 2, reason: 'No remaining loading space' },
    ])
  })

  it('derives physical layers from support depth instead of z height buckets', () => {
    const container = testContainer({ length: 2000, width: 1000, height: 1500 })
    const result = calculatePacking(container, [
      cargo({ id: 'tall-base', label: 'T', length: 1000, width: 1000, height: 1000, quantity: 1, canRotate: false }),
      cargo({ id: 'half', label: 'H', length: 1000, width: 1000, height: 500, quantity: 3, canRotate: false }),
    ])

    expectValidPacking(container, result)
    expect(result.layers.map((layer) => ({ layer: layer.physicalLayer, count: layer.count }))).toEqual([
      { layer: 1, count: 2 },
      { layer: 2, count: 2 },
    ])

    const secondLayerBoxes = result.placed.filter((box) => box.physicalLayer === 2)
    expect(new Set(secondLayerBoxes.map((box) => box.z))).toEqual(new Set([500, 1000]))
    expect(result.layers[1].minZ).toBe(500)
    expect(result.layers[1].maxZ).toBe(1500)
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
      { label: 'B', name: 'Beta', color: '#f59e0b', planned: 1, placed: 1, unplaced: 0, layers: [2] },
    ])
    expect(result.unplaced[0]).toMatchObject({ cargoId: 'a', label: 'A', quantity: 1, reason: 'Exceeds maximum payload' })
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
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reason: 'No remaining loading space' })
  })

  it('rejects boxes that exceed dimensions', () => {
    const result = calculatePacking(containers[0], [cargo({ length: 9000 })])

    expectValidPacking(containers[0], result)
    expect(result.placedCount).toBe(0)
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reason: 'Exceeds container dimensions' })
  })

  it('rejects boxes after payload is exhausted', () => {
    const result = calculatePacking(containers[0], [cargo({ weight: 20_000, quantity: 2 })])

    expectValidPacking(containers[0], result)
    expect(result.placedCount).toBe(1)
    expect(result.unplaced[0]).toMatchObject({ quantity: 1, reason: 'Exceeds maximum payload' })
  })

  it('uses effective dimensions after reserved gaps for boundary checks', () => {
    const result = calculatePacking(testContainer({ length: 2000, width: 1000, height: 1000, doorGap: 200 }), [
      cargo({ id: 'gap-blocked', label: 'G', length: 1900, width: 1000, height: 1000, quantity: 1, canRotate: false }),
    ])

    expect(result.placedCount).toBe(0)
    expect(result.unplaced[0]).toMatchObject({ cargoId: 'gap-blocked', reason: 'Exceeds container dimensions' })
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
    expect(result.placed.filter((box) => box.label === 'A').every((box) => box.height === 350)).toBe(true)
    expect(result.placed.filter((box) => box.label !== 'A').every((box) => box.height === 450)).toBe(true)
  })
})
