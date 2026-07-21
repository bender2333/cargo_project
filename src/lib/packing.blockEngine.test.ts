import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { containers, effectiveContainer } from '../data/containers'
import type { ContainerSpec, CargoItem, PlacedBox } from '../types'
import { calculatePacking, shouldUseBlockEngine } from './packing'
import { expectPackingResultContract } from './packingContract.testSupport'
import { isGapFillBox } from './placementSource'

const VOXEL_MM = 50

function vietnamFixture(): { container: ContainerSpec; items: CargoItem[] } {
  const fixture = JSON.parse(readFileSync('test-data/json/vietnam-11/input.json', 'utf8')) as { container: ContainerSpec; items: CargoItem[] }
  return {
    ...fixture,
    items: fixture.items.map((item, index) => ({
      ...item,
      id: `vietnam-${String(index + 1).padStart(2, '0')}`,
    })),
  }
}

function packingMetrics(placed: PlacedBox[], container: ContainerSpec) {
  const effective = effectiveContainer(container)
  const usedVolume = placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0)
  const envX = Math.max(...placed.map((box) => box.x + box.length))
  const envY = Math.max(...placed.map((box) => box.y + box.width))
  const envZ = Math.max(...placed.map((box) => box.z + box.height))

  const nx = Math.ceil(effective.length / VOXEL_MM)
  const ny = Math.ceil(effective.width / VOXEL_MM)
  const nz = Math.ceil(effective.height / VOXEL_MM)
  const occupied = new Uint8Array(nx * ny * nz)
  const index = (x: number, y: number, z: number) => (x * ny + y) * nz + z

  for (const box of placed) {
    const x0 = Math.floor(box.x / VOXEL_MM)
    const x1 = Math.ceil((box.x + box.length) / VOXEL_MM)
    const y0 = Math.floor(box.y / VOXEL_MM)
    const y1 = Math.ceil((box.y + box.width) / VOXEL_MM)
    const z0 = Math.floor(box.z / VOXEL_MM)
    const z1 = Math.ceil((box.z + box.height) / VOXEL_MM)
    for (let x = x0; x < x1 && x < nx; x += 1) {
      for (let y = y0; y < y1 && y < ny; y += 1) {
        for (let z = z0; z < z1 && z < nz; z += 1) occupied[index(x, y, z)] = 1
      }
    }
  }

  let floorFilled = 0
  for (let x = 0; x < nx; x += 1) {
    for (let y = 0; y < ny; y += 1) {
      if (occupied[index(x, y, 0)]) floorFilled += 1
    }
  }

  return {
    envelopeFillPct: (usedVolume / (envX * envY * envZ)) * 100,
    floorEmptyPct: ((nx * ny - floorFilled) / (nx * ny)) * 100,
    utilPct: (usedVolume / (effective.length * effective.width * effective.height)) * 100,
  }
}

function placedDistributionKey(placed: PlacedBox[]) {
  const counts = new Map<string, number>()
  for (const box of placed) counts.set(box.cargoId, (counts.get(box.cargoId) ?? 0) + 1)
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cargoId, count]) => `${cargoId}:${count}`)
    .join('|')
}

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

function expectNoOverlapOrBounds(container: ContainerSpec, placed: PlacedBox[]) {
  const effective = effectiveContainer(container)
  for (const box of placed) {
    if (
      box.x < 0 ||
      box.y < 0 ||
      box.z < 0 ||
      box.x + box.length > effective.length ||
      box.y + box.width > effective.width ||
      box.z + box.height > effective.height
    ) {
      throw new Error(`Box ${box.id} exceeds container bounds`)
    }
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      if (boxesOverlap(placed[i], placed[j])) {
        throw new Error(`Boxes ${placed[i].id} and ${placed[j].id} overlap`)
      }
    }
  }
}

describe('block-building packing engine', () => {
  it('uses the block path for large pure carton loads even below the old five-SKU gate', () => {
    const container: ContainerSpec = {
      id: 'two-sku-cartons',
      label: 'Two SKU carton container',
      description: 'Enough room to exercise block placement below the old SKU gate',
      length: 5000,
      width: 2400,
      height: 2400,
      maxWeight: 50_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }
    const items: CargoItem[] = [
      { id: 'a', name: 'A carton', label: 'A', length: 1000, width: 600, height: 600, weight: 10, quantity: 49, color: '#f59e0b', canRotate: false, stackable: true },
      { id: 'b', name: 'B carton', label: 'B', length: 800, width: 600, height: 600, weight: 10, quantity: 51, color: '#0ea5e9', canRotate: false, stackable: true },
    ]

    expect(shouldUseBlockEngine(items, 'quantity')).toBe(true)
    expect(shouldUseBlockEngine(items.slice(0, 1), 'quantity')).toBe(false)
    expect(shouldUseBlockEngine([{ ...items[0], maxStackLayers: 2 }, items[1]], 'quantity')).toBe(false)

    const result = calculatePacking(container, items, { loadingMode: 'quantity' })

    expect(result.placedCount).toBeGreaterThan(0)
    expect(result.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([])
  })

  it('removes the Vietnam 20GP vertical-gap regression in both optimization modes', () => {
    const fixture = vietnamFixture()
    const outcomes = (['quantity', 'volume'] as const).map((mode) => {
      const startedAt = Date.now()
      const result = calculatePacking(fixture.container, fixture.items, { loadingMode: mode })
      const elapsedMs = Date.now() - startedAt
      const metrics = packingMetrics(result.placed, fixture.container)
      return { mode, result, elapsedMs, metrics }
    })

    for (const { mode, result, elapsedMs, metrics } of outcomes) {
      expect(result.placedCount).toBeGreaterThanOrEqual(443)
      expect(metrics.utilPct).toBeGreaterThanOrEqual(79.6)
      expect(metrics.envelopeFillPct).toBeGreaterThan(88)
      expect(metrics.floorEmptyPct).toBeLessThan(8)
      expect(result.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([])
      expectNoOverlapOrBounds(fixture.container, result.placed)
      expect(elapsedMs).toBeLessThan(5000)
      expectPackingResultContract(`vietnam-20gp-${mode}`, result)
    }

    const [quantity, volume] = outcomes
    expect(outcomes.some(({ result }) => result.placed.some(isGapFillBox))).toBe(true)
    expect(quantity.result.placedCount).toBeGreaterThanOrEqual(volume.result.placedCount)
    expect(
      quantity.result.placedCount !== volume.result.placedCount
      || placedDistributionKey(quantity.result.placed) !== placedDistributionKey(volume.result.placed),
    ).toBe(true)
  })

  it('keeps Vietnam 40HQ utilization above the frozen baseline', () => {
    const fixture = vietnamFixture()
    const container = containers.find((item) => item.id === '40hq')
    if (!container) throw new Error('Missing 40HQ container fixture')

    for (const mode of ['quantity', 'volume'] as const) {
      const startedAt = Date.now()
      const result = calculatePacking(container, fixture.items, { loadingMode: mode })
      const elapsedMs = Date.now() - startedAt
      const metrics = packingMetrics(result.placed, container)

      expect(metrics.utilPct).toBeGreaterThan(76.5)
      expect(result.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([])
      expectNoOverlapOrBounds(container, result.placed)
      expect(elapsedMs).toBeLessThan(20_000)
      expectPackingResultContract(`vietnam-40hq-${mode}`, result)
    }
  }, 25_000)
})
