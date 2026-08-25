import type { ContainerSpec, PlacementBox } from '../types'
import { scoreRemainingEmsQuality } from './packingLookahead'
import type { PackingSearchState } from './packingSearchState'

export type PackingObjective = 'quantity' | 'volume'

export type PackingQuality = {
  placedCount: number
  usedVolume: number
  internalNotchVolume: number
  interCargoMaxMm: number
  deadEmsVolume: number
  externalResidualVolume: number
}

const QUALITY_VOXEL = 50
const QUALITY_VOXEL_VOLUME = QUALITY_VOXEL * QUALITY_VOXEL * QUALITY_VOXEL

function layoutCompactness(placed: PlacementBox[], container: ContainerSpec) {
  if (placed.length === 0) {
    return {
      internalNotchVolume: 0,
      interCargoMaxMm: 0,
      externalResidualVolume: container.length * container.width * container.height,
    }
  }

  const nx = Math.ceil(container.length / QUALITY_VOXEL)
  const ny = Math.ceil(container.width / QUALITY_VOXEL)
  const nz = Math.ceil(container.height / QUALITY_VOXEL)
  const occupied = new Uint8Array(nx * ny * nz)
  const index = (x: number, y: number, z: number) => (x * ny + y) * nz + z

  for (const box of placed) {
    const x0 = Math.max(0, Math.floor(box.x / QUALITY_VOXEL))
    const x1 = Math.min(nx, Math.ceil((box.x + box.length) / QUALITY_VOXEL))
    const y0 = Math.max(0, Math.floor(box.y / QUALITY_VOXEL))
    const y1 = Math.min(ny, Math.ceil((box.y + box.width) / QUALITY_VOXEL))
    const z0 = Math.max(0, Math.floor(box.z / QUALITY_VOXEL))
    const z1 = Math.min(nz, Math.ceil((box.z + box.height) / QUALITY_VOXEL))
    for (let x = x0; x < x1; x += 1) {
      for (let y = y0; y < y1; y += 1) {
        for (let z = z0; z < z1; z += 1) occupied[index(x, y, z)] = 1
      }
    }
  }

  let interCargoMaxMm = 0
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
          interCargoMaxMm = Math.max(interCargoMaxMm, (y - start) * QUALITY_VOXEL)
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
          interCargoMaxMm = Math.max(interCargoMaxMm, (x - start) * QUALITY_VOXEL)
        }
      }
    }
  }

  const visited = new Uint8Array(nx * ny * nz)
  const dirs: Array<[number, number, number]> = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ]
  let internalNotchVoxels = 0
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
        while (stack.length > 0) {
          const current = stack.pop()
          if (!current) break
          const [cx, cy, cz] = current
          count += 1
          if (cx === 0 || cy === 0 || cz === 0 || cx === nx - 1 || cy === ny - 1 || cz === nz - 1) {
            touchesBoundary = true
          }
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
        if (touchesBoundary) externalResidualVoxels += count
        else internalNotchVoxels += count
      }
    }
  }

  return {
    internalNotchVolume: internalNotchVoxels * QUALITY_VOXEL_VOLUME,
    interCargoMaxMm,
    externalResidualVolume: externalResidualVoxels * QUALITY_VOXEL_VOLUME,
  }
}

export function packingQualityOf(state: PackingSearchState): PackingQuality {
  const compactness = layoutCompactness(state.placed, state.container)
  const leftover = scoreRemainingEmsQuality(state.emsList, state.cargoStates)
  return {
    placedCount: state.placed.length,
    usedVolume: state.placed.reduce((sum, box) => sum + box.length * box.width * box.height, 0),
    internalNotchVolume: compactness.internalNotchVolume,
    interCargoMaxMm: compactness.interCargoMaxMm,
    deadEmsVolume: leftover.deadVolume,
    externalResidualVolume: compactness.externalResidualVolume,
  }
}

function compareCompactness(a: PackingQuality, b: PackingQuality) {
  return a.internalNotchVolume - b.internalNotchVolume
    || a.interCargoMaxMm - b.interCargoMaxMm
    || a.deadEmsVolume - b.deadEmsVolume
    || a.externalResidualVolume - b.externalResidualVolume
}

/** Negative means a is better than b (same convention as compareBlockPlacement). */
export function comparePackingQuality(
  a: PackingQuality,
  b: PackingQuality,
  objective: PackingObjective,
): number {
  if (objective === 'volume') {
    const volumeDelta = b.usedVolume - a.usedVolume
    if (volumeDelta !== 0) return volumeDelta
  }

  const countDelta = b.placedCount - a.placedCount
  if (countDelta !== 0) return countDelta

  return compareCompactness(a, b)
}
