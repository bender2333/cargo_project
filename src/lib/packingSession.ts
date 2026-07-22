import type { CargoItem, ContainerSpec, LoadingMode, PackingResult } from '../types'

type ContainerNumberField = keyof Pick<
  ContainerSpec,
  'length' | 'width' | 'height' | 'maxWeight' | 'doorGap' | 'topGap' | 'sideGap'
>

export type PackingSessionState = {
  cargoItems: CargoItem[]
  containerSnapshots: Record<string, ContainerSpec>
  selectedContainerId: string
  loadingMode: LoadingMode
  defaultMaxStackLayers?: number
  automaticResult: PackingResult | null
}

export type PackingSessionAction =
  | { type: 'cargoAdded'; items: CargoItem[] }
  | { type: 'cargoEdited'; item: CargoItem }
  | { type: 'cargoDeleted'; cargoId: string }
  | { type: 'cargoReordered'; cargoId: string; targetCargoId: string }
  | { type: 'cargoImported'; items: CargoItem[] }
  | { type: 'containerChanged'; container: ContainerSpec }
  | { type: 'containerUpdated'; field: ContainerNumberField; value: number }
  | { type: 'loadingModeChanged'; loadingMode: LoadingMode }
  | { type: 'defaultMaxStackLayersChanged'; defaultMaxStackLayers?: number }
  | { type: 'calculationCompleted'; result: PackingResult }
  | { type: 'resultInvalidated' }

export type PackingSessionInitialState = Omit<PackingSessionState, 'containerSnapshots'> & {
  containerSnapshots: ContainerSpec[]
}

function copyCargoItems(items: CargoItem[]): CargoItem[] {
  return items.map((item) => ({ ...item }))
}

function copyContainer(container: ContainerSpec): ContainerSpec {
  return { ...container }
}

export function createPackingSessionState(initial: PackingSessionInitialState): PackingSessionState {
  return {
    ...initial,
    cargoItems: copyCargoItems(initial.cargoItems),
    containerSnapshots: Object.fromEntries(
      initial.containerSnapshots.map((container) => [container.id, copyContainer(container)]),
    ),
  }
}

export function selectPackingContainer(state: PackingSessionState): ContainerSpec {
  return state.containerSnapshots[state.selectedContainerId]
}

function invalidateResult(state: PackingSessionState): PackingSessionState {
  if (state.automaticResult === null) return state
  return { ...state, automaticResult: null }
}

export function packingSessionReducer(
  state: PackingSessionState,
  action: PackingSessionAction,
): PackingSessionState {
  switch (action.type) {
    case 'cargoAdded':
      if (action.items.length === 0) return state
      return {
        ...state,
        cargoItems: [...state.cargoItems, ...copyCargoItems(action.items)],
        automaticResult: null,
      }
    case 'cargoEdited': {
      const index = state.cargoItems.findIndex((item) => item.id === action.item.id)
      if (index < 0) return state
      const cargoItems = [...state.cargoItems]
      cargoItems[index] = { ...action.item }
      return { ...state, cargoItems, automaticResult: null }
    }
    case 'cargoDeleted': {
      const cargoItems = state.cargoItems.filter((item) => item.id !== action.cargoId)
      if (cargoItems.length === state.cargoItems.length) return state
      return { ...state, cargoItems, automaticResult: null }
    }
    case 'cargoReordered': {
      const fromIndex = state.cargoItems.findIndex((item) => item.id === action.cargoId)
      const toIndex = state.cargoItems.findIndex((item) => item.id === action.targetCargoId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return state
      const cargoItems = [...state.cargoItems]
      const [moved] = cargoItems.splice(fromIndex, 1)
      cargoItems.splice(toIndex, 0, moved)
      return { ...state, cargoItems, automaticResult: null }
    }
    case 'cargoImported':
      return { ...state, cargoItems: copyCargoItems(action.items), automaticResult: null }
    case 'containerChanged':
      return {
        ...state,
        selectedContainerId: action.container.id,
        containerSnapshots: {
          ...state.containerSnapshots,
          [action.container.id]: copyContainer(action.container),
        },
        automaticResult: null,
      }
    case 'containerUpdated': {
      const container = selectPackingContainer(state)
      const updatedContainer = { ...container, [action.field]: action.value }
      return {
        ...state,
        containerSnapshots: {
          ...state.containerSnapshots,
          [updatedContainer.id]: updatedContainer,
        },
        automaticResult: null,
      }
    }
    case 'loadingModeChanged':
      if (state.loadingMode === action.loadingMode) return state
      return { ...state, loadingMode: action.loadingMode, automaticResult: null }
    case 'defaultMaxStackLayersChanged':
      if (state.defaultMaxStackLayers === action.defaultMaxStackLayers) return state
      return {
        ...state,
        defaultMaxStackLayers: action.defaultMaxStackLayers,
        automaticResult: null,
      }
    case 'calculationCompleted':
      return { ...state, automaticResult: action.result }
    case 'resultInvalidated':
      return invalidateResult(state)
  }
}
