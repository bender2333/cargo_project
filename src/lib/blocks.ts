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
          const count = footprintCount * nz
          const length = box.length * nx
          const width = box.width * ny
          const height = box.height * nz
          blocks.push({
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
          })
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
