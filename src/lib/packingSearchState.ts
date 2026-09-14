import type { CargoItem, ContainerSpec, PlacementBox } from '../types'
import type { EmptyMaximalSpace } from './emsSpace'
import type { StackChainNode } from './stackCapacity'

export type PackingCargoState = {
  item: CargoItem
  itemIndex: number
  label: string
  remaining: number
  nextIndex: number
}

export type PackingSearchState = {
  container: ContainerSpec
  cargoStates: PackingCargoState[]
  emsList: EmptyMaximalSpace[]
  placed: PlacementBox[]
  placedById: Map<string, StackChainNode>
  usedWeight: number
  minSupportRatio: number
}

export function clonePackingSearchState(state: PackingSearchState): PackingSearchState {
  const placed = state.placed.map((box) => ({ ...box, supportedBy: [...box.supportedBy] }))
  const placedById = new Map<string, StackChainNode>()
  for (const box of placed) placedById.set(box.id, box)
  for (const [id, node] of state.placedById) {
    if (placedById.has(id)) continue
    placedById.set(id, { ...node, supportedBy: [...node.supportedBy] })
  }
  return {
    container: state.container,
    cargoStates: state.cargoStates.map((entry) => ({ ...entry })),
    emsList: state.emsList.map((space) => ({ ...space })),
    placed,
    placedById,
    usedWeight: state.usedWeight,
    minSupportRatio: state.minSupportRatio,
  }
}
