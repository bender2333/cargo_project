import type { CargoItem, ContainerSpec, PlacedBox } from '../types'

type OrientationKey = PlacedBox['orientationKey']

type OrientedBox = {
  orientationKey: OrientationKey
  length: number
  width: number
  height: number
}

export type BlockCandidate = {
  cargoId: string
  name: string
  label: string
  color: string
  orientationKey: OrientationKey
  box: OrientedBox
  nx: number
  ny: number
  nz: number
  count: number
  length: number
  width: number
  height: number
  volume: number
  footprintArea: number
  weight: number
}

const MAX_BLOCKS_PER_ORIENTATION = 4

export function maxBlocksForSpace(
  item: CargoItem,
  remaining: number,
  space: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
): BlockCandidate[] {
  if (remaining <= 0) return []

  const blocks: BlockCandidate[] = []
  for (const box of orientations(item)) {
    const found = maxBlockForOrientation(item, remaining, space, box)
    if (found) blocks.push(found)
  }
  return blocks
}

export function bestBlocksForSpace(
  item: CargoItem,
  remaining: number,
  space: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
): BlockCandidate[] {
  if (remaining <= 0) return []

  const blocks: BlockCandidate[] = []
  for (const box of orientations(item)) {
    const maxNx = Math.min(Math.floor(space.length / box.length), remaining)
    const maxNy = Math.min(Math.floor(space.width / box.width), remaining)
    const maxNz = maxStackCount(item, Math.floor(space.height / box.height), remaining)
    if (maxNx <= 0 || maxNy <= 0 || maxNz <= 0) continue

    const best = maxBlockDims(item, remaining, space, box)
    if (!best) continue

    const seen = new Set<string>()
    const add = (nx: number, ny: number, nz: number) => {
      if (nx < 1 || ny < 1 || nz < 1 || nx > maxNx || ny > maxNy || nz > maxNz) return
      const count = nx * ny * nz
      if (count < 1 || count > remaining) return
      const key = `${nx}x${ny}x${nz}`
      if (seen.has(key) || seen.size >= MAX_BLOCKS_PER_ORIENTATION) return
      seen.add(key)
      blocks.push(makeBlockCandidate(item, box, nx, ny, nz))
    }

    add(best.nx, best.ny, best.nz)
    if (best.ny > 1) {
      const ny = best.ny - 1
      add(Math.min(maxNx, Math.floor(remaining / (ny * best.nz))), ny, best.nz)
    }
    if (best.nx > 1) add(best.nx - 1, best.ny, best.nz)
    if (best.nz > 1) {
      const nz = best.nz - 1
      add(Math.min(maxNx, Math.floor(remaining / (best.ny * nz))), best.ny, nz)
    }
  }
  return blocks
}

function maxBlockForOrientation(
  item: CargoItem,
  remaining: number,
  space: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
  box: OrientedBox,
): BlockCandidate | undefined {
  const dims = maxBlockDims(item, remaining, space, box)
  return dims ? makeBlockCandidate(item, box, dims.nx, dims.ny, dims.nz) : undefined
}

function maxBlockDims(
  item: CargoItem,
  remaining: number,
  space: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
  box: OrientedBox,
) {
  const maxNx = Math.min(Math.floor(space.length / box.length), remaining)
  const maxNy = Math.min(Math.floor(space.width / box.width), remaining)
  const maxNz = maxStackCount(item, Math.floor(space.height / box.height), remaining)
  if (maxNx <= 0 || maxNy <= 0 || maxNz <= 0) return undefined

  let best: { nx: number; ny: number; nz: number; count: number; footprint: number } | undefined
  for (let nz = maxNz; nz >= 1; nz -= 1) {
    for (let ny = maxNy; ny >= 1; ny -= 1) {
      const nx = Math.min(maxNx, Math.floor(remaining / (ny * nz)))
      if (nx < 1) continue
      const count = nx * ny * nz
      const footprint = box.length * nx * box.width * ny
      if (!best || count > best.count || (count === best.count && footprint > best.footprint)) {
        best = { nx, ny, nz, count, footprint }
      }
      if (best.count === remaining) break
    }
    if (best?.count === remaining) break
  }
  return best
}

function makeBlockCandidate(
  item: CargoItem,
  box: OrientedBox,
  nx: number,
  ny: number,
  nz: number,
): BlockCandidate {
  const count = nx * ny * nz
  const length = box.length * nx
  const width = box.width * ny
  const height = box.height * nz
  return {
    cargoId: item.id,
    name: item.name,
    label: item.label ?? item.name,
    color: item.color,
    orientationKey: box.orientationKey,
    box,
    nx,
    ny,
    nz,
    count,
    length,
    width,
    height,
    volume: length * width * height,
    footprintArea: length * width,
    weight: item.weight * count,
  }
}

export function generateBlockCandidates(
  item: CargoItem,
  container: Pick<ContainerSpec, 'length' | 'width' | 'height'>,
): BlockCandidate[] {
  if (item.quantity <= 0) return []

  const blocks: BlockCandidate[] = []
  for (const box of orientations(item)) {
    const maxNx = Math.min(Math.floor(container.length / box.length), item.quantity)
    const maxNy = Math.min(Math.floor(container.width / box.width), item.quantity)
    const maxNz = maxStackCount(item, Math.floor(container.height / box.height), item.quantity)
    if (maxNx <= 0 || maxNy <= 0 || maxNz <= 0) continue

    for (let nx = 1; nx <= maxNx; nx++) {
      for (let ny = 1; ny <= maxNy; ny++) {
        const footprintCount = nx * ny
        const nzLimit = Math.min(maxNz, Math.floor(item.quantity / footprintCount))
        for (let nz = 1; nz <= nzLimit; nz++) {
          blocks.push(makeBlockCandidate(item, box, nx, ny, nz))
        }
      }
    }
  }

  return blocks
}

function maxStackCount(item: CargoItem, byContainerHeight: number, byQuantity: number): number {
  if (item.groundOnly || !item.stackable) return Math.min(1, byContainerHeight, byQuantity)
  const byCargoLimit = Number.isFinite(item.maxStackLayers) && item.maxStackLayers
    ? Math.max(1, Math.floor(item.maxStackLayers))
    : byContainerHeight
  return Math.min(byContainerHeight, byCargoLimit, byQuantity)
}

function orientations(item: CargoItem): OrientedBox[] {
  const base = makeOrientation(item.length, item.width, item.height, 'LWH')
  if (!item.canRotate) return [base]

  return [
    base,
    makeOrientation(item.width, item.length, item.height, 'WLH'),
    makeOrientation(item.length, item.height, item.width, 'LHW'),
    makeOrientation(item.height, item.length, item.width, 'HLW'),
    makeOrientation(item.width, item.height, item.length, 'WHL'),
    makeOrientation(item.height, item.width, item.length, 'HWL'),
  ].filter((option, index, list) => (
    list.findIndex((other) => (
      other.length === option.length
      && other.width === option.width
      && other.height === option.height
    )) === index
  ))
}

function makeOrientation(length: number, width: number, height: number, orientationKey: OrientationKey): OrientedBox {
  return { length, width, height, orientationKey }
}
