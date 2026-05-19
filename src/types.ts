export type ContainerSpec = {
  id: string
  label: string
  description: string
  length: number
  width: number
  height: number
  maxWeight: number
}

export type CargoItem = {
  id: string
  name: string
  label?: string
  length: number
  width: number
  height: number
  weight: number
  quantity: number
  color: string
  canRotate: boolean
  stackable: boolean
}

export type PlacedBox = {
  id: string
  cargoId: string
  name: string
  label: string
  index: number
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  weight: number
  color: string
  stackable: boolean
}

export type UnplacedCargo = {
  cargoId: string
  name: string
  quantity: number
  reason: string
}

export type PackingResult = {
  placed: PlacedBox[]
  unplaced: UnplacedCargo[]
  totalCargoCount: number
  placedCount: number
  usedVolume: number
  containerVolume: number
  volumeUtilization: number
  usedWeight: number
  weightUtilization: number
}

export type LayerSpec = {
  id: string
  name: string
  z: number
  minZ: number
  maxZ: number
  count: number
}

export type Locale = 'en' | 'zh'
