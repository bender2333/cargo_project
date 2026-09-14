import type { ContainerSpec, PlacementBox } from '../types'

export const LAYOUT_QUALITY_VOXEL = 50
const VOXEL_VOLUME = LAYOUT_QUALITY_VOXEL * LAYOUT_QUALITY_VOXEL * LAYOUT_QUALITY_VOXEL
const EPSILON = 0.001

export type OccupiedGrid = {
  nx: number
  ny: number
  nz: number
  voxel: number
  occupied: Uint8Array
  index: (x: number, y: number, z: number) => number
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>
}

export type InterCargoGap = {
  mm: number
  axis: 'x' | 'y'
  x0: number
  x1: number
  y0: number
  y1: number
  z: number
}

export type LocatedInterCargoGap = InterCargoGap & {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  touchesBoundary: boolean
}

export type LayoutCompactness = {
  internalNotchVolume: number
  externalResidualVolume: number
  interCargoMaxMm: number
  unsupportedSpanRisk: number
}

type Rect = {
  x0: number
  y0: number
  x1: number
  y1: number
}

type SupportCarrier = Pick<PlacementBox, 'id' | 'x' | 'y' | 'length' | 'width'>

function rectArea(rect: Rect) {
  return Math.max(0, rect.x1 - rect.x0) * Math.max(0, rect.y1 - rect.y0)
}

function overlapRect(box: PlacementBox, supporter: SupportCarrier): Rect | null {
  const x0 = Math.max(box.x, supporter.x)
  const y0 = Math.max(box.y, supporter.y)
  const x1 = Math.min(box.x + box.length, supporter.x + supporter.length)
  const y1 = Math.min(box.y + box.width, supporter.y + supporter.width)
  if (x1 - x0 <= EPSILON || y1 - y0 <= EPSILON) return null
  return { x0, y0, x1, y1 }
}

function uniqueSorted(values: number[]) {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b)
}

function cellCovered(cell: Rect, rects: Rect[]) {
  return rects.some((rect) => (
    rect.x0 <= cell.x0 + EPSILON
    && rect.x1 >= cell.x1 - EPSILON
    && rect.y0 <= cell.y0 + EPSILON
    && rect.y1 >= cell.y1 - EPSILON
  ))
}

function unionArea(rects: Rect[]) {
  if (rects.length === 0) return 0
  const xs = uniqueSorted(rects.flatMap((rect) => [rect.x0, rect.x1]))
  const ys = uniqueSorted(rects.flatMap((rect) => [rect.y0, rect.y1]))
  let area = 0
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const cell = { x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] }
      if (cell.x1 - cell.x0 <= EPSILON || cell.y1 - cell.y0 <= EPSILON) continue
      if (cellCovered(cell, rects)) area += rectArea(cell)
    }
  }
  return area
}

function maxUnsupportedSpan(footprint: Rect, support: Rect[]) {
  const xs = uniqueSorted([footprint.x0, footprint.x1, ...support.flatMap((rect) => [rect.x0, rect.x1])])
    .filter((value) => value >= footprint.x0 - EPSILON && value <= footprint.x1 + EPSILON)
  const ys = uniqueSorted([footprint.y0, footprint.y1, ...support.flatMap((rect) => [rect.y0, rect.y1])])
    .filter((value) => value >= footprint.y0 - EPSILON && value <= footprint.y1 + EPSILON)
  if (xs.length < 2 || ys.length < 2) return Math.max(footprint.x1 - footprint.x0, footprint.y1 - footprint.y0)

  let maxSpan = 0

  for (let j = 0; j < ys.length - 1; j += 1) {
    const y0 = ys[j]
    const y1 = ys[j + 1]
    if (y1 - y0 <= EPSILON) continue
    let runStart: number | null = null
    for (let i = 0; i < xs.length - 1; i += 1) {
      const x0 = xs[i]
      const x1 = xs[i + 1]
      if (x1 - x0 <= EPSILON) continue
      if (!cellCovered({ x0, x1, y0, y1 }, support)) {
        if (runStart === null) runStart = x0
        maxSpan = Math.max(maxSpan, x1 - runStart)
      } else {
        runStart = null
      }
    }
  }

  for (let i = 0; i < xs.length - 1; i += 1) {
    const x0 = xs[i]
    const x1 = xs[i + 1]
    if (x1 - x0 <= EPSILON) continue
    let runStart: number | null = null
    for (let j = 0; j < ys.length - 1; j += 1) {
      const y0 = ys[j]
      const y1 = ys[j + 1]
      if (y1 - y0 <= EPSILON) continue
      if (!cellCovered({ x0, x1, y0, y1 }, support)) {
        if (runStart === null) runStart = y0
        maxSpan = Math.max(maxSpan, y1 - runStart)
      } else {
        runStart = null
      }
    }
  }

  return maxSpan
}

function supporterOf(
  id: string,
  placed: PlacementBox[],
  placedById?: Map<string, SupportCarrier>,
): SupportCarrier | undefined {
  return placedById?.get(id) ?? placed.find((candidate) => candidate.id === id)
}

export function occupyPlacedBoxes(
  placed: PlacementBox[],
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
  voxel = LAYOUT_QUALITY_VOXEL,
): OccupiedGrid {
  const nx = Math.ceil(container.length / voxel)
  const ny = Math.ceil(container.width / voxel)
  const nz = Math.ceil(container.height / voxel)
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

  return { nx, ny, nz, voxel, occupied, index, container }
}

export function emptyComponentVolumes(grid: OccupiedGrid) {
  const { nx, ny, nz, occupied, index, voxel } = grid
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

  const cellVolume = voxel * voxel * voxel
  return {
    internalNotchVolume: internalNotchVoxels * cellVolume,
    externalResidualVolume: externalResidualVoxels * cellVolume,
  }
}

export function scanInterCargoGaps(grid: OccupiedGrid): { maxMm: number; largest: InterCargoGap | undefined } {
  const { nx, ny, nz, occupied, index, voxel } = grid
  let largest: InterCargoGap | undefined

  const note = (mm: number, axis: 'x' | 'y', x0: number, x1: number, y0: number, y1: number, z: number) => {
    if (largest && mm <= largest.mm) return
    largest = { mm, axis, x0, x1, y0, y1, z }
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
          note((y - start) * voxel, 'y', x, x + 1, start, y, z)
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
          note((x - start) * voxel, 'x', start, x, y, y + 1, z)
        }
      }
    }
  }

  return { maxMm: largest?.mm ?? 0, largest }
}

export function largestInterCargoGap(
  placed: PlacementBox[],
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
): LocatedInterCargoGap | undefined {
  if (placed.length === 0) return undefined
  const grid = occupyPlacedBoxes(placed, container)
  const { largest } = scanInterCargoGaps(grid)
  if (!largest) return undefined

  const minX = largest.x0 * grid.voxel
  const maxX = largest.x1 * grid.voxel
  const minY = largest.y0 * grid.voxel
  const maxY = largest.y1 * grid.voxel
  const minZ = largest.z * grid.voxel
  const maxZ = (largest.z + 1) * grid.voxel
  const touchesBoundary = minX <= EPSILON
    || minY <= EPSILON
    || minZ <= EPSILON
    || maxX >= container.length - EPSILON
    || maxY >= container.width - EPSILON
    || maxZ >= container.height - EPSILON
  return { ...largest, minX, maxX, minY, maxY, minZ, maxZ, touchesBoundary }
}

export function unsupportedSpanRiskOf(
  placed: PlacementBox[],
  placedById?: Map<string, SupportCarrier>,
) {
  let risk = 0
  for (const box of placed) {
    if (box.z <= EPSILON) continue
    const footprint: Rect = {
      x0: box.x,
      y0: box.y,
      x1: box.x + box.length,
      y1: box.y + box.width,
    }
    const supportRects: Rect[] = []
    for (const supportId of box.supportedBy) {
      const supporter = supporterOf(supportId, placed, placedById)
      if (!supporter) continue
      const rect = overlapRect(box, supporter)
      if (rect) supportRects.push(rect)
    }
    const baseArea = box.length * box.width
    const supportedArea = unionArea(supportRects)
    const unsupportedArea = Math.max(0, baseArea - supportedArea)
    if (unsupportedArea <= EPSILON) continue
    risk += unsupportedArea * maxUnsupportedSpan(footprint, supportRects)
  }
  return risk
}

export function layoutCompactness(
  placed: PlacementBox[],
  container: ContainerSpec,
  placedById?: Map<string, SupportCarrier>,
): LayoutCompactness {
  if (placed.length === 0) {
    return {
      internalNotchVolume: 0,
      unsupportedSpanRisk: 0,
      interCargoMaxMm: 0,
      externalResidualVolume: container.length * container.width * container.height,
    }
  }

  const grid = occupyPlacedBoxes(placed, container)
  const volumes = emptyComponentVolumes(grid)
  const gaps = scanInterCargoGaps(grid)
  return {
    internalNotchVolume: volumes.internalNotchVolume,
    externalResidualVolume: volumes.externalResidualVolume,
    interCargoMaxMm: gaps.maxMm,
    unsupportedSpanRisk: unsupportedSpanRiskOf(placed, placedById),
  }
}

export { VOXEL_VOLUME as LAYOUT_QUALITY_VOXEL_VOLUME }
