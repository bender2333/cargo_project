import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { containers, effectiveContainer } from '../data/containers'
import type { CargoItem, ContainerSpec, PlacedBox } from '../types'
import { calculatePacking, shouldUseBlockEngine } from './packing'
import { expectQuantityConservation } from './packingContract.testSupport'
import { largestInterCargoGap, layoutCompactness } from './packingLayoutQuality'
import { violatesStackChain } from './stackCapacity'

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

type GapReport = {
  internalNotchVoxels: number
  internalNotchMaxRunMm: number
  interCargoMaxMm: number
  interCargo: { mm: number; x: number; y: number; z: number; axis: 'x' | 'y' }
  externalResidualVoxels: number
  envX: number
  envY: number
  envZ: number
}

/**
 * interCargo = empty run with cargo on both sides in the same z slice (货物间槽).
 * internal_notch = empty 3D component that never touches a container face.
 * external_residual = empty component that touches door / side / top / floor.
 */
function analyzePackingGaps(placed: PlacedBox[], container: ContainerSpec, voxel = VOXEL): GapReport {
  const effective = effectiveContainer(container)
  if (placed.length === 0) {
    return {
      internalNotchVoxels: 0,
      internalNotchMaxRunMm: 0,
      interCargoMaxMm: 0,
      interCargo: { mm: 0, x: 0, y: 0, z: 0, axis: 'x' },
      externalResidualVoxels: 0,
      envX: 0,
      envY: 0,
      envZ: 0,
    }
  }

  const envX = Math.max(...placed.map((box) => box.x + box.length))
  const envY = Math.max(...placed.map((box) => box.y + box.width))
  const envZ = Math.max(...placed.map((box) => box.z + box.height))
  const nx = Math.ceil(effective.length / voxel)
  const ny = Math.ceil(effective.width / voxel)
  const nz = Math.ceil(effective.height / voxel)
  const occupied = new Uint8Array(nx * ny * nz)
  const index = (x: number, y: number, z: number) => (x * ny + y) * nz + z

  for (const box of placed) {
    const x0 = Math.max(0, Math.floor(box.x / voxel))
    const x1 = Math.min(nx, Math.ceil((box.x + box.length) / voxel))
    const y0 = Math.max(0, Math.floor(box.y / voxel))
    const y1 = Math.min(ny, Math.ceil((box.y + box.width) / voxel))
    const z0 = Math.max(0, Math.floor(box.z / voxel))
    const z1 = Math.min(nz, Math.ceil((box.z + box.height) / voxel))
    for (let x = x0; x < x1; x += 1) {
      for (let y = y0; y < y1; y += 1) {
        for (let z = z0; z < z1; z += 1) occupied[index(x, y, z)] = 1
      }
    }
  }

  let interCargoMaxMm = 0
  let interCargo: GapReport['interCargo'] = { mm: 0, x: 0, y: 0, z: 0, axis: 'x' }

  const noteBothSides = (mm: number, x: number, y: number, z: number, axis: 'x' | 'y') => {
    if (mm <= interCargoMaxMm) return
    interCargoMaxMm = mm
    interCargo = { mm, x, y, z, axis }
  }

  for (let z = 0; z < Math.max(0, nz - 1); z += 1) {
    for (let x = 0; x < nx; x += 1) {
      let y = 0
      while (y < ny) {
        if (occupied[index(x, y, z)]) {
          y += 1
          continue
        }
        const start = y
        while (y < ny && !occupied[index(x, y, z)]) y += 1
        if (start > 0 && y < ny && occupied[index(x, start - 1, z)] && occupied[index(x, y, z)]) {
          noteBothSides((y - start) * voxel, x * voxel, start * voxel, z * voxel, 'y')
        }
      }
    }
    for (let y = 0; y < ny; y += 1) {
      let x = 0
      while (x < nx) {
        if (occupied[index(x, y, z)]) {
          x += 1
          continue
        }
        const start = x
        while (x < nx && !occupied[index(x, y, z)]) x += 1
        if (start > 0 && x < nx && occupied[index(start - 1, y, z)] && occupied[index(x, y, z)]) {
          noteBothSides((x - start) * voxel, start * voxel, y * voxel, z * voxel, 'x')
        }
      }
    }
  }

  const visited = new Uint8Array(nx * ny * nz)
  const dirs: Array<[number, number, number]> = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ]
  let internalNotchVoxels = 0
  let internalNotchMaxRunMm = 0
  let externalResidualVoxels = 0

  for (let x = 0; x < nx; x += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let z = 0; z < nz; z += 1) {
        const startIndex = index(x, y, z)
        if (occupied[startIndex] || visited[startIndex]) continue
        const stack = [[x, y, z]]
        visited[startIndex] = 1
        let count = 0
        let touchesBoundary = false
        let minX = x
        let maxX = x
        let minY = y
        let maxY = y
        let minZ = z
        let maxZ = z
        while (stack.length > 0) {
          const current = stack.pop()
          if (!current) break
          const [cx, cy, cz] = current
          count += 1
          if (cx === 0 || cy === 0 || cz === 0 || cx === nx - 1 || cy === ny - 1 || cz === nz - 1) {
            touchesBoundary = true
          }
          minX = Math.min(minX, cx)
          maxX = Math.max(maxX, cx)
          minY = Math.min(minY, cy)
          maxY = Math.max(maxY, cy)
          minZ = Math.min(minZ, cz)
          maxZ = Math.max(maxZ, cz)
          for (const [dx, dy, dz] of dirs) {
            const nx2 = cx + dx
            const ny2 = cy + dy
            const nz2 = cz + dz
            if (nx2 < 0 || ny2 < 0 || nz2 < 0 || nx2 >= nx || ny2 >= ny || nz2 >= nz) continue
            const next = index(nx2, ny2, nz2)
            if (occupied[next] || visited[next]) continue
            visited[next] = 1
            stack.push([nx2, ny2, nz2])
          }
        }
        if (touchesBoundary) {
          externalResidualVoxels += count
        } else {
          internalNotchVoxels += count
          const span = Math.max(maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1) * voxel
          if (span > internalNotchMaxRunMm) internalNotchMaxRunMm = span
        }
      }
    }
  }

  return {
    internalNotchVoxels,
    internalNotchMaxRunMm,
    interCargoMaxMm,
    interCargo,
    externalResidualVoxels,
    envX,
    envY,
    envZ,
  }
}

function expectSupportContract(placed: PlacedBox[]) {
  const graph = new Map(placed.map((box) => [box.id, box]))
  for (const box of placed) {
    expect(violatesStackChain(box, graph), `${box.id} stack chain`).toBeNull()
  }
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
  it('keeps a mixed 20GP load geometrically legal when quantity prefers more pieces', () => {
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
    expectSupportContract(result.placed)
    expect(result.placedCount).toBeGreaterThan(500)
    const gaps = analyzePackingGaps(result.placed, container)
    expect(
      gaps.internalNotchVoxels,
      `enclosed cavity is still illegal; corridor=${lengthCorridorVoxels(result.placed, container).longestMm}mm slot=${gaps.interCargoMaxMm}mm`,
    ).toBe(0)
  }, 15_000)

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
    const orientationsUsed = new Set(tall.map((box) => box.orientationKey))
    expect(orientationsUsed.size).toBeGreaterThan(0)
  })

  it('keeps 0824 quantity geometrically legal and at or above 504 without a 200mm slot cap', () => {
    const fixture = JSON.parse(readFileSync('test-data/json/0824/input.json', 'utf8')) as {
      loadingMode: 'quantity'
      container: ContainerSpec
      items: CargoItem[]
    }
    const total = fixture.items.reduce((sum, item) => sum + item.quantity, 0)
    expect(total).toBe(2544)
    expect(shouldUseBlockEngine(fixture.items, fixture.loadingMode, effectiveContainer(fixture.container))).toBe(true)

    const startedAt = Date.now()
    const result = calculatePacking(fixture.container, fixture.items, { loadingMode: fixture.loadingMode })
    const elapsedMs = Date.now() - startedAt
    const gaps = analyzePackingGaps(result.placed, fixture.container)

    expectGeometry(fixture.container, result.placed)
    expectSupportContract(result.placed)
    expectQuantityConservation(fixture.items, result)
    expect(
      result.placedCount,
      `placed=${result.placedCount} interCargo=${gaps.interCargoMaxMm}mm at ${JSON.stringify(gaps.interCargo)} elapsed=${elapsedMs}ms`,
    ).toBeGreaterThanOrEqual(504)
    expect(elapsedMs).toBeLessThan(15_000)
  }, 20_000)

  it('keeps the Vietnam template load compact at the upper packing front', () => {
    const fixture = JSON.parse(readFileSync('test-data/json/vietnam-11/input.json', 'utf8')) as {
      loadingMode: 'quantity'
      container: ContainerSpec
      items: CargoItem[]
    }
    const result = calculatePacking(fixture.container, fixture.items, { loadingMode: fixture.loadingMode })
    const gap = largestInterCargoGap(result.placed, fixture.container)

    expectQuantityConservation(fixture.items, result)
    expect(result.placedCount, 'the template load must not regress to the 464-piece scattered layout').toBeGreaterThanOrEqual(480)
    expect(gap?.mm ?? 0, `Vietnam upper-front slot is ${gap?.mm ?? 0}mm`).toBeLessThan(1000)
    expect(layoutCompactness(result.placed, fixture.container).internalNotchVolume).toBe(0)
  }, 20_000)

  it('keeps the Vietnam template volume load compact at the upper packing front', () => {
    const fixture = JSON.parse(readFileSync('test-data/json/vietnam-11/input.json', 'utf8')) as {
      container: ContainerSpec
      items: CargoItem[]
    }
    const result = calculatePacking(fixture.container, fixture.items, { loadingMode: 'volume' })
    const gap = largestInterCargoGap(result.placed, fixture.container)
    const compactness = layoutCompactness(result.placed, fixture.container)

    expectQuantityConservation(fixture.items, result)
    expect(result.usedVolume, 'volume mode must retain the high-utilization layout').toBeGreaterThanOrEqual(30_800_000_000)
    expect(gap?.mm ?? 0, `Vietnam volume upper-front slot is ${gap?.mm ?? 0}mm`).toBeLessThan(1000)
    expect(compactness.internalNotchVolume).toBe(0)
  }, 20_000)

  it('does not pick a max-count C13 block that leaves a 400mm side channel next to C10 in a 360mm-tall space', () => {
    const container: ContainerSpec = {
      id: 'upper-ems-360',
      label: '360mm upper EMS replica',
      description: 'Isolates the 0824 equal-count C13 vs C10 footprint choice',
      length: 5758,
      width: 2000,
      height: 360,
      maxWeight: 50_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }
    const items = [
      cargo({ id: 'c13', name: 'TB-C13', label: 'C13', length: 530, width: 305, height: 360, quantity: 54 }),
      cargo({ id: 'c10', name: 'TB-C10', label: 'C10', length: 530, width: 305, height: 310, quantity: 56 }),
    ]
    expect(shouldUseBlockEngine(items, 'quantity', effectiveContainer(container))).toBe(true)

    const result = calculatePacking(container, items, { loadingMode: 'quantity' })
    const gaps = analyzePackingGaps(result.placed, container)

    expectGeometry(container, result.placed)
    expectSupportContract(result.placed)
    expectQuantityConservation(items, result)
    expect(gaps.internalNotchVoxels).toBe(0)
    expect(result.placedCount, 'compact C13 must not place fewer pieces than the greedy 54+10 layout').toBeGreaterThanOrEqual(64)
    if (result.placedCount <= 64) {
      expect(
        gaps.interCargoMaxMm,
        `equal-count C13 must not leave a 400mm side channel; interCargo=${gaps.interCargoMaxMm}mm placed=${result.placedCount}`,
      ).toBeLessThan(200)
    }
    const c13 = result.placed.filter((box) => box.cargoId === 'c13')
    const c13SpanY = Math.max(...c13.map((box) => box.y + box.width)) - Math.min(...c13.map((box) => box.y))
    if (result.placedCount <= 64) {
      expect(
        c13SpanY,
        `equal-count C13 y-span ${c13SpanY}mm should use the 9x6 1830mm footprint instead of 18x3 1590mm; placed=${result.placedCount} interCargo=${gaps.interCargoMaxMm}`,
      ).toBeGreaterThan(1700)
    }
  })

  it('keeps origin-packed L leftover legal and does not scatter cargo to fill the door wall', () => {
    const container = gp20()
    const items = [
      cargo({ id: 'A', length: 400, width: 300, height: 400, quantity: 50 }),
      cargo({ id: 'B', length: 530, width: 365, height: 310, quantity: 80 }),
    ]
    const result = calculatePacking(container, items, { loadingMode: 'quantity' })
    const gaps = analyzePackingGaps(result.placed, container)
    const effective = effectiveContainer(container)

    expect(result.placedCount).toBe(130)
    expect(gaps.internalNotchVoxels).toBe(0)
    expect(gaps.interCargoMaxMm).toBeLessThan(200)
    expect(Math.min(...result.placed.map((box) => box.x))).toBeLessThan(1)
    expect(Math.min(...result.placed.map((box) => box.y))).toBeLessThan(1)
    expect(effective.length - gaps.envX > 100 || effective.width - gaps.envY > 100).toBe(true)
  })

  it('keeps seeded mixed 20GP loads free of enclosed cavities', () => {
    const sizes = [
      { length: 530, width: 305, height: 310 },
      { length: 530, width: 305, height: 360 },
      { length: 580, width: 365, height: 435 },
      { length: 350, width: 260, height: 210 },
      { length: 400, width: 400, height: 380 },
    ]
    for (const seed of [1, 7, 13]) {
      let state = seed >>> 0
      const next = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return state / 0x100000000
      }
      const items = sizes.map((size, index) => cargo({
        id: `r${seed}-${index}`,
        ...size,
        quantity: 40 + Math.floor(next() * 80),
      }))
      const container = gp20()
      expect(shouldUseBlockEngine(items, 'quantity', effectiveContainer(container))).toBe(true)
      const result = calculatePacking(container, items, { loadingMode: 'quantity' })
      const gaps = analyzePackingGaps(result.placed, container)
      expectGeometry(container, result.placed)
      expectSupportContract(result.placed)
      expect(gaps.internalNotchVoxels, `seed ${seed} enclosed cavity`).toBe(0)
    }
  }, 20_000)
})
