import type { ContainerSpec } from '../types'

const EPSILON = 0.001

export type EmptyMaximalSpace = {
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
}

export type EMSBox = EmptyMaximalSpace

export type EMSBestFit = {
  ems: EmptyMaximalSpace
  point: { x: number; y: number; z: number }
  waste: number
}

export function initEMS(container: Pick<ContainerSpec, 'length' | 'width' | 'height'>): EmptyMaximalSpace[] {
  return [{ x: 0, y: 0, z: 0, length: container.length, width: container.width, height: container.height }]
}

export function splitEMS(emsList: EmptyMaximalSpace[], placedBox: EMSBox): EmptyMaximalSpace[] {
  const next: EmptyMaximalSpace[] = []

  for (const ems of emsList) {
    if (!intersects(ems, placedBox)) {
      next.push(ems)
      continue
    }

    const ix0 = Math.max(ems.x, placedBox.x)
    const iy0 = Math.max(ems.y, placedBox.y)
    const iz0 = Math.max(ems.z, placedBox.z)
    const ix1 = Math.min(maxX(ems), maxX(placedBox))
    const iy1 = Math.min(maxY(ems), maxY(placedBox))
    const iz1 = Math.min(maxZ(ems), maxZ(placedBox))

    next.push(
      { ...ems, length: ix0 - ems.x },
      { ...ems, x: ix1, length: maxX(ems) - ix1 },
      { ...ems, width: iy0 - ems.y },
      { ...ems, y: iy1, width: maxY(ems) - iy1 },
      { ...ems, height: iz0 - ems.z },
      { ...ems, z: iz1, height: maxZ(ems) - iz1 },
    )
  }

  return pruneContained(next)
}

export function pruneContained(emsList: EmptyMaximalSpace[]): EmptyMaximalSpace[] {
  const unique: EmptyMaximalSpace[] = []
  for (const ems of emsList) {
    if (!hasPositiveVolume(ems)) continue
    if (!unique.some((candidate) => sameSpace(candidate, ems))) unique.push(ems)
  }

  return unique.filter((ems, index) => !unique.some((candidate, candidateIndex) => (
    candidateIndex !== index && contains(candidate, ems)
  )))
}

export function emsBestFit(
  emsList: EmptyMaximalSpace[],
  blockSize: Pick<EmptyMaximalSpace, 'length' | 'width' | 'height'>,
): EMSBestFit | null {
  let best: EMSBestFit | null = null
  const blockVolume = volume(blockSize)

  for (const ems of emsList) {
    if (blockSize.length > ems.length + EPSILON || blockSize.width > ems.width + EPSILON || blockSize.height > ems.height + EPSILON) {
      continue
    }

    const candidate: EMSBestFit = {
      ems,
      point: { x: ems.x, y: ems.y, z: ems.z },
      waste: volume(ems) - blockVolume,
    }

    if (!best || compareBestFit(candidate, best) < 0) best = candidate
  }

  return best
}

function compareBestFit(a: EMSBestFit, b: EMSBestFit): number {
  return a.waste - b.waste
    || a.point.z - b.point.z
    || a.point.y - b.point.y
    || a.point.x - b.point.x
}

function hasPositiveVolume(space: EmptyMaximalSpace): boolean {
  return space.length > EPSILON && space.width > EPSILON && space.height > EPSILON
}

function sameSpace(a: EmptyMaximalSpace, b: EmptyMaximalSpace): boolean {
  return Math.abs(a.x - b.x) <= EPSILON
    && Math.abs(a.y - b.y) <= EPSILON
    && Math.abs(a.z - b.z) <= EPSILON
    && Math.abs(a.length - b.length) <= EPSILON
    && Math.abs(a.width - b.width) <= EPSILON
    && Math.abs(a.height - b.height) <= EPSILON
}

function contains(outer: EmptyMaximalSpace, inner: EmptyMaximalSpace): boolean {
  return outer.x <= inner.x + EPSILON
    && outer.y <= inner.y + EPSILON
    && outer.z <= inner.z + EPSILON
    && maxX(outer) >= maxX(inner) - EPSILON
    && maxY(outer) >= maxY(inner) - EPSILON
    && maxZ(outer) >= maxZ(inner) - EPSILON
}

function intersects(a: EmptyMaximalSpace, b: EMSBox): boolean {
  return a.x < maxX(b) - EPSILON && b.x < maxX(a) - EPSILON
    && a.y < maxY(b) - EPSILON && b.y < maxY(a) - EPSILON
    && a.z < maxZ(b) - EPSILON && b.z < maxZ(a) - EPSILON
}

function volume(size: Pick<EmptyMaximalSpace, 'length' | 'width' | 'height'>): number {
  return size.length * size.width * size.height
}

function maxX(space: Pick<EmptyMaximalSpace, 'x' | 'length'>): number {
  return space.x + space.length
}

function maxY(space: Pick<EmptyMaximalSpace, 'y' | 'width'>): number {
  return space.y + space.width
}

function maxZ(space: Pick<EmptyMaximalSpace, 'z' | 'height'>): number {
  return space.z + space.height
}
