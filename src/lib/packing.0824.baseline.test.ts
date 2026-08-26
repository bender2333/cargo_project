import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { effectiveContainer } from '../data/containers'
import type { CargoItem, ContainerSpec, PlacedBox } from '../types'
import { calculatePacking } from './packing'
import { expectQuantityConservation } from './packingContract.testSupport'

/**
 * 0824 comparison floor, NOT an algorithm ceiling.
 * Quantity may place more than 504 if a higher-count feasible layout exists,
 * including a 400mm boundary-connected slot. Volume must not drop usedVolume.
 */
const QUANTITY_FLOOR_PLACED = 504
const VOLUME_FLOOR_USED_VOLUME = 30_725_850_000
const VOXEL = 50

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

function load0824() {
  return JSON.parse(readFileSync('test-data/json/0824/input.json', 'utf8')) as {
    loadingMode: 'quantity'
    container: ContainerSpec
    items: CargoItem[]
  }
}

describe('0824 packing baseline snapshot', () => {
  it('keeps quantity at or above the 504 floor without treating a 400mm external slot as failure', () => {
    const fixture = load0824()
    const total = fixture.items.reduce((sum, item) => sum + item.quantity, 0)
    expect(total).toBe(2544)

    const result = calculatePacking(fixture.container, fixture.items, { loadingMode: 'quantity' })
    const gaps = analyzePackingGaps(result.placed, fixture.container)

    expectQuantityConservation(fixture.items, result)
    expect(
      result.placedCount,
      `0824 quantity placed=${result.placedCount} slot=${gaps.interCargoMaxMm}mm notch=${gaps.internalNotchVoxels}`,
    ).toBeGreaterThanOrEqual(QUANTITY_FLOOR_PLACED)
    expect(gaps.interCargoMaxMm, 'a boundary-connected 400mm slot must not fail this comparison').toBeGreaterThanOrEqual(0)
  }, 20_000)

  it('records a named volume snapshot for the same 0824 fixture', () => {
    const fixture = load0824()
    const result = calculatePacking(fixture.container, fixture.items, { loadingMode: 'volume' })
    const gaps = analyzePackingGaps(result.placed, fixture.container)

    expectQuantityConservation(fixture.items, result)
    expect(result.usedVolume).toBeGreaterThanOrEqual(VOLUME_FLOOR_USED_VOLUME)
    expect(gaps.internalNotchVoxels).toBe(0)
  }, 20_000)
})
