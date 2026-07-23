import type { CargoItem, ContainerSpec, LoadingMode, PackingResult } from '../types'

type ContainerNumberField = keyof Pick<
  ContainerSpec,
  'length' | 'width' | 'height' | 'maxWeight' | 'doorGap' | 'topGap' | 'sideGap'
>

export type PackingSessionState = {
  projectName: string
  shipmentName: string
  cargoItems: CargoItem[]
  containerSnapshots: Record<string, ContainerSpec>
  selectedContainerId: string
  loadingMode: LoadingMode
  defaultMaxStackLayers?: number
  automaticResult: PackingResult | null
  inputRevision: number
  calculationRequestId: number
  completedCalculationRequestId: number
}

export type PackingSessionRestoreInput = {
  projectName: string
  shipmentName: string
  container: ContainerSpec
  cargoItems: CargoItem[]
  loadingMode: LoadingMode
  defaultMaxStackLayers?: number
}

export type PackingSessionDispatchAction =
  | { type: 'cargoAdded'; items: CargoItem[] }
  | { type: 'cargoEdited'; item: CargoItem }
  | { type: 'cargoDeleted'; cargoId: string }
  | { type: 'cargoReordered'; cargoId: string; targetCargoId: string }
  | { type: 'cargoImported'; items: CargoItem[] }
  | { type: 'containerChanged'; container: ContainerSpec }
  | { type: 'containerUpdated'; field: ContainerNumberField; value: number }
  | { type: 'loadingModeChanged'; loadingMode: LoadingMode }
  | { type: 'defaultMaxStackLayersChanged'; defaultMaxStackLayers?: number }
  | { type: 'shipmentNameChanged'; shipmentName: string }
  | { type: 'resultInvalidated' }

export type PackingSessionAction = PackingSessionDispatchAction
  | { type: 'calculationRequested' }
  | {
    type: 'calculationCompleted'
    requestId: number
    inputRevision: number
    result: PackingResult
  }
  | {
    type: 'historyRestored'
    snapshot: PackingSessionRestoreInput & { result: PackingResult }
  }

export type PackingSessionInitialState = Omit<
  PackingSessionState,
  'containerSnapshots' | 'inputRevision' | 'calculationRequestId' | 'completedCalculationRequestId'
> & {
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
    inputRevision: 0,
    calculationRequestId: 0,
    completedCalculationRequestId: 0,
  }
}

export function selectPackingContainer(state: PackingSessionState): ContainerSpec {
  return state.containerSnapshots[state.selectedContainerId]
}

function invalidateResult(state: PackingSessionState): PackingSessionState {
  return {
    ...state,
    automaticResult: null,
    inputRevision: state.inputRevision + 1,
  }
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
        inputRevision: state.inputRevision + 1,
      }
    case 'cargoEdited': {
      const index = state.cargoItems.findIndex((item) => item.id === action.item.id)
      if (index < 0) return state
      const cargoItems = [...state.cargoItems]
      cargoItems[index] = { ...action.item }
      return {
        ...state,
        cargoItems,
        automaticResult: null,
        inputRevision: state.inputRevision + 1,
      }
    }
    case 'cargoDeleted': {
      const cargoItems = state.cargoItems.filter((item) => item.id !== action.cargoId)
      if (cargoItems.length === state.cargoItems.length) return state
      return {
        ...state,
        cargoItems,
        automaticResult: null,
        inputRevision: state.inputRevision + 1,
      }
    }
    case 'cargoReordered': {
      const fromIndex = state.cargoItems.findIndex((item) => item.id === action.cargoId)
      const toIndex = state.cargoItems.findIndex((item) => item.id === action.targetCargoId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return state
      const cargoItems = [...state.cargoItems]
      const [moved] = cargoItems.splice(fromIndex, 1)
      cargoItems.splice(toIndex, 0, moved)
      return {
        ...state,
        cargoItems,
        automaticResult: null,
        inputRevision: state.inputRevision + 1,
      }
    }
    case 'cargoImported':
      return {
        ...state,
        cargoItems: copyCargoItems(action.items),
        automaticResult: null,
        inputRevision: state.inputRevision + 1,
      }
    case 'containerChanged':
      return {
        ...state,
        selectedContainerId: action.container.id,
        containerSnapshots: {
          ...state.containerSnapshots,
          [action.container.id]: copyContainer(action.container),
        },
        automaticResult: null,
        inputRevision: state.inputRevision + 1,
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
        inputRevision: state.inputRevision + 1,
      }
    }
    case 'loadingModeChanged':
      if (state.loadingMode === action.loadingMode) return state
      return {
        ...state,
        loadingMode: action.loadingMode,
        automaticResult: null,
        inputRevision: state.inputRevision + 1,
      }
    case 'defaultMaxStackLayersChanged':
      if (state.defaultMaxStackLayers === action.defaultMaxStackLayers) return state
      return {
        ...state,
        defaultMaxStackLayers: action.defaultMaxStackLayers,
        automaticResult: null,
        inputRevision: state.inputRevision + 1,
      }
    case 'shipmentNameChanged':
      if (state.shipmentName === action.shipmentName) return state
      return { ...state, shipmentName: action.shipmentName }
    case 'calculationRequested':
      return { ...state, calculationRequestId: state.calculationRequestId + 1 }
    case 'calculationCompleted':
      if (action.requestId !== state.calculationRequestId
        || action.inputRevision !== state.inputRevision) {
        return state
      }
      return {
        ...state,
        automaticResult: action.result,
        completedCalculationRequestId: action.requestId,
      }
    case 'historyRestored': {
      const { snapshot } = action
      return {
        ...state,
        projectName: snapshot.projectName,
        shipmentName: snapshot.shipmentName,
        cargoItems: copyCargoItems(snapshot.cargoItems),
        containerSnapshots: {
          ...state.containerSnapshots,
          [snapshot.container.id]: copyContainer(snapshot.container),
        },
        selectedContainerId: snapshot.container.id,
        loadingMode: snapshot.loadingMode,
        defaultMaxStackLayers: snapshot.defaultMaxStackLayers,
        automaticResult: snapshot.result,
        inputRevision: state.inputRevision + 1,
        completedCalculationRequestId: state.calculationRequestId,
      }
    }
    case 'resultInvalidated':
      return invalidateResult(state)
  }
}
