import { describe, expect, it } from 'vitest'
import { containers, effectiveContainer } from '../data/containers'
import type { CargoItem, ContainerSpec, PlacedBox } from '../types'
import { calculatePacking, shouldUseBlockEngine } from './packing'

const VOXEL = 50

function cargo(overrides: Partial<CargoItem> & Pick<CargoItem, 'id' | 'length' | 'width' | 'height' | 'quantity'>): CargoItem {
  return {
    name: overrides.name ?? overrides.id,
    label: overrides.label ?? overrides.id,
    weight: 8,
    color: '#64748b',
    canRotate: true,
    stackable: true,
    ...overrides,
  }
}

function gp20(): ContainerSpec {
  const found = containers.find((item) => item.id === '20gp')
  if (!found) throw new Error('missing 20gp')
  return found
}

function floorOccupancy(placed: PlacedBox[], container: ContainerSpec) {
  const effective = effectiveContainer(container)
  const nx = Math.ceil(effective.length / VOXEL)
  const ny = Math.ceil(effective.width / VOXEL)
  const occ = Array.from({ length: nx }, () => new Uint8Array(ny))
  for (const box of placed) {
    const x0 = Math.max(0, Math.floor(box.x / VOXEL))
    const x1 = Math.min(nx, Math.ceil((box.x + box.length) / VOXEL))
    const y0 = Math.max(0, Math.floor(box.y / VOXEL))
    const y1 = Math.min(ny, Math.ceil((box.y + box.width) / VOXEL))
    for (let x = x0; x < x1; x += 1) {
      for (let y = y0; y < y1; y += 1) occ[x][y] = 1
    }
  }
  return { occ, nx, ny }
}

/** Empty cells between the first and last occupied column on a floor row — the length-wise groove. */
function lengthCorridorVoxels(placed: PlacedBox[], container: ContainerSpec) {
  const { occ, nx, ny } = floorOccupancy(placed, container)
  let cells = 0
  let longestRun = 0
  for (let y = 0; y < ny; y += 1) {
    let first = -1
    let last = -1
    for (let x = 0; x < nx; x += 1) {
      if (!occ[x][y]) continue
      if (first < 0) first = x
      last = x
    }
    if (first < 0) continue
    let run = 0
    for (let x = first; x <= last; x += 1) {
      if (occ[x][y]) {
        run = 0
        continue
      }
      cells += 1
      run += 1
      if (run > longestRun) longestRun = run
    }
  }
  return { cells, longestMm: longestRun * VOXEL }
}

function boxesOverlap(a: PlacedBox, b: PlacedBox) {
  return !(
    a.x + a.length <= b.x
    || b.x + b.length <= a.x
    || a.y + a.width <= b.y
    || b.y + b.width <= a.y
    || a.z + a.height <= b.z
    || b.z + b.height <= a.z
  )
}

function expectGeometry(container: ContainerSpec, placed: PlacedBox[]) {
  const effective = effectiveContainer(container)
  for (const box of placed) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.z).toBeGreaterThanOrEqual(0)
    expect(box.x + box.length).toBeLessThanOrEqual(effective.length + 0.001)
    expect(box.y + box.width).toBeLessThanOrEqual(effective.width + 0.001)
    expect(box.z + box.height).toBeLessThanOrEqual(effective.height + 0.001)
  }
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      expect(boxesOverlap(placed[i], placed[j]), `${placed[i].id} overlaps ${placed[j].id}`).toBe(false)
    }
  }
}

describe('automatic packing compactness', () => {
  it('does not leave a length-wise floor corridor between two cargo masses', () => {
    const container = gp20()
    const items = [
      cargo({ id: 'A', length: 500, width: 250, height: 380, quantity: 99 }),
      cargo({ id: 'B', length: 300, width: 365, height: 510, quantity: 262 }),
      cargo({ id: 'C', length: 350, width: 250, height: 360, quantity: 207 }),
      cargo({ id: 'D', length: 365, width: 365, height: 385, quantity: 66 }),
      cargo({ id: 'E', length: 300, width: 250, height: 510, quantity: 1 }),
      cargo({ id: 'F', length: 600, width: 280, height: 310, quantity: 1 }),
    ]
    expect(shouldUseBlockEngine(items, 'quantity', effectiveContainer(container))).toBe(true)

    const result = calculatePacking(container, items, { loadingMode: 'quantity' })
    expectGeometry(container, result.placed)
    expect(result.placedCount).toBeGreaterThan(500)

    const corridor = lengthCorridorVoxels(result.placed, container)
    expect(
      corridor.longestMm,
      `length-wise empty run ${corridor.longestMm}mm (${corridor.cells} cells) between cargo on the same floor row`,
    ).toBeLessThan(200)
  })

  it('keeps an under-filled mixed load as an origin-packed L rather than scattering to the far corner', () => {
    const container = gp20()
    const items = [
      cargo({ id: 'A', length: 400, width: 300, height: 400, quantity: 50 }),
      cargo({ id: 'B', length: 530, width: 365, height: 310, quantity: 80 }),
    ]
    expect(shouldUseBlockEngine(items, 'quantity', effectiveContainer(container))).toBe(true)

    const result = calculatePacking(container, items, { loadingMode: 'quantity' })
    expect(result.placedCount).toBe(130)
    expectGeometry(container, result.placed)

    const corridor = lengthCorridorVoxels(result.placed, container)
    expect(corridor.longestMm).toBeLessThan(200)

    const envX = Math.max(...result.placed.map((box) => box.x + box.length))
    const envY = Math.max(...result.placed.map((box) => box.y + box.width))
    const effective = effectiveContainer(container)
    expect(effective.length - envX > 100 || effective.width - envY > 100).toBe(true)
    expect(Math.min(...result.placed.map((box) => box.x))).toBeLessThan(1)
    expect(Math.min(...result.placed.map((box) => box.y))).toBeLessThan(1)
  })

  it('still places cargo by tilting when container height is below the upright height', () => {
    const container: ContainerSpec = {
      id: 'short',
      label: 'Short',
      description: 'Height only fits a tilted 600mm carton',
      length: 4000,
      width: 2000,
      height: 500,
      maxWeight: 50_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }
    const items = [
      cargo({ id: 'tall', length: 400, width: 300, height: 600, quantity: 80, canRotate: true }),
      cargo({ id: 'mate', length: 350, width: 250, height: 400, quantity: 40, canRotate: true }),
    ]
    expect(shouldUseBlockEngine(items, 'quantity', effectiveContainer(container))).toBe(true)

    const result = calculatePacking(container, items, { loadingMode: 'quantity' })
    const tall = result.placed.filter((box) => box.cargoId === 'tall')
    expect(tall.length).toBeGreaterThan(0)
    expect(tall.every((box) => box.height <= 500)).toBe(true)
    expect(tall.some((box) => box.height < 600 - 0.001)).toBe(true)
    expectGeometry(container, result.placed)
  })
})
