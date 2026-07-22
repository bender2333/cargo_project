import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec, PackingResult } from '../types'
import {
  createPackingSessionState,
  packingSessionReducer,
  selectPackingContainer,
} from './packingSession'

const container20: ContainerSpec = {
  id: '20gp',
  label: '20GP',
  description: '20 foot container',
  length: 5898,
  width: 2352,
  height: 2393,
  maxWeight: 28000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

const container40: ContainerSpec = {
  ...container20,
  id: '40hq',
  label: '40HQ',
  length: 12032,
  height: 2698,
}

const cargoA: CargoItem = {
  id: 'cargo-a',
  name: 'Cargo A',
  label: 'A',
  length: 1000,
  width: 800,
  height: 600,
  weight: 100,
  quantity: 2,
  color: '#f59e0b',
  canRotate: true,
  stackable: true,
}

const cargoB: CargoItem = {
  ...cargoA,
  id: 'cargo-b',
  name: 'Cargo B',
  label: 'B',
  quantity: 1,
  color: '#0ea5e9',
}

const calculatedResult: PackingResult = {
  placed: [],
  unplaced: [],
  layers: [],
  workSteps: [],
  labelStats: [],
  diagnostics: [],
  totalCargoCount: 3,
  placedCount: 0,
  usedVolume: 0,
  containerVolume: container20.length * container20.width * container20.height,
  volumeUtilization: 0,
  usedWeight: 0,
  weightUtilization: 0,
}

function makeCalculatedState() {
  return createPackingSessionState({
    cargoItems: [cargoA, cargoB],
    containerSnapshots: [container20],
    selectedContainerId: container20.id,
    loadingMode: 'quantity',
    defaultMaxStackLayers: 4,
    automaticResult: calculatedResult,
  })
}

describe('packingSessionReducer', () => {
  it('appends new cargo and invalidates the calculated placement in one transition', () => {
    const cargoC = { ...cargoB, id: 'cargo-c', name: 'Cargo C', label: 'C' }

    const next = packingSessionReducer(makeCalculatedState(), {
      type: 'cargoAdded',
      items: [cargoC],
    })

    expect(next.cargoItems.map((item) => item.id)).toEqual(['cargo-a', 'cargo-b', 'cargo-c'])
    expect(next.automaticResult).toBeNull()
  })

  it('edits only the matching cargo and invalidates the result', () => {
    const edited = { ...cargoA, quantity: 7, label: 'AX' }

    const next = packingSessionReducer(makeCalculatedState(), {
      type: 'cargoEdited',
      item: edited,
    })

    expect(next.cargoItems).toEqual([edited, cargoB])
    expect(next.automaticResult).toBeNull()
  })

  it('deletes only the requested cargo and invalidates the result', () => {
    const next = packingSessionReducer(makeCalculatedState(), {
      type: 'cargoDeleted',
      cargoId: cargoA.id,
    })

    expect(next.cargoItems).toEqual([cargoB])
    expect(next.automaticResult).toBeNull()
  })

  it('reorders cargo without cloning items and invalidates input-order results', () => {
    const state = makeCalculatedState()

    const next = packingSessionReducer(state, {
      type: 'cargoReordered',
      cargoId: cargoA.id,
      targetCargoId: cargoB.id,
    })

    expect(next.cargoItems).toEqual([cargoB, cargoA])
    expect(next.cargoItems[0]).toBe(state.cargoItems[1])
    expect(next.cargoItems[1]).toBe(state.cargoItems[0])
    expect(next.automaticResult).toBeNull()
  })

  it('replaces the complete cargo dataset on import and preserves import order', () => {
    const imported = [
      { ...cargoB, id: 'import-b' },
      { ...cargoA, id: 'import-a' },
    ]

    const next = packingSessionReducer(makeCalculatedState(), {
      type: 'cargoImported',
      items: imported,
    })

    expect(next.cargoItems).toEqual(imported)
    expect(next.automaticResult).toBeNull()
  })

  it('selects a complete container snapshot and invalidates even an empty calculated result', () => {
    const next = packingSessionReducer(makeCalculatedState(), {
      type: 'containerChanged',
      container: container40,
    })

    expect(next.selectedContainerId).toBe(container40.id)
    expect(selectPackingContainer(next)).toEqual(container40)
    expect(next.automaticResult).toBeNull()
  })

  it('replaces the complete snapshot when the selected container keeps its id', () => {
    const renamedSnapshot = {
      ...container20,
      label: 'Historical 20GP',
      description: 'Saved with the plan',
    }

    const next = packingSessionReducer(makeCalculatedState(), {
      type: 'containerChanged',
      container: renamedSnapshot,
    })

    expect(selectPackingContainer(next)).toEqual(renamedSnapshot)
    expect(selectPackingContainer(next)).not.toBe(renamedSnapshot)
    expect(next.automaticResult).toBeNull()
  })

  it('updates the selected container snapshot and invalidates the result', () => {
    const next = packingSessionReducer(makeCalculatedState(), {
      type: 'containerUpdated',
      field: 'sideGap',
      value: 125,
    })

    expect(selectPackingContainer(next).sideGap).toBe(125)
    expect(next.automaticResult).toBeNull()
  })

  it('invalidates the result when the loading mode changes', () => {
    const next = packingSessionReducer(makeCalculatedState(), {
      type: 'loadingModeChanged',
      loadingMode: 'volume',
    })

    expect(next.loadingMode).toBe('volume')
    expect(next.automaticResult).toBeNull()
  })

  it('invalidates the result when the global stack limit changes', () => {
    const next = packingSessionReducer(makeCalculatedState(), {
      type: 'defaultMaxStackLayersChanged',
      defaultMaxStackLayers: 6,
    })

    expect(next.defaultMaxStackLayers).toBe(6)
    expect(next.automaticResult).toBeNull()
  })

  it('publishes a completed calculation without changing its input snapshot', () => {
    const dirtyState = packingSessionReducer(makeCalculatedState(), { type: 'resultInvalidated' })
    const nextResult = { ...calculatedResult, placedCount: 2 }

    const next = packingSessionReducer(dirtyState, {
      type: 'calculationCompleted',
      result: nextResult,
    })

    expect(next.automaticResult).toBe(nextResult)
    expect(next.cargoItems).toBe(dirtyState.cargoItems)
    expect(selectPackingContainer(next)).toBe(selectPackingContainer(dirtyState))
  })

  it('invalidates a result without changing any packing input', () => {
    const state = makeCalculatedState()

    const next = packingSessionReducer(state, { type: 'resultInvalidated' })

    expect(next.automaticResult).toBeNull()
    expect(next.cargoItems).toBe(state.cargoItems)
    expect(next.containerSnapshots).toBe(state.containerSnapshots)
    expect(next.loadingMode).toBe(state.loadingMode)
    expect(next.defaultMaxStackLayers).toBe(state.defaultMaxStackLayers)
  })

  it('owns copies of caller-provided cargo and container snapshots', () => {
    const initialCargo = { ...cargoA }
    const initialContainer = { ...container20 }
    const state = createPackingSessionState({
      cargoItems: [initialCargo],
      containerSnapshots: [initialContainer],
      selectedContainerId: initialContainer.id,
      loadingMode: 'quantity',
      automaticResult: calculatedResult,
    })

    initialCargo.quantity = 99
    initialContainer.length = 99

    expect(state.cargoItems[0].quantity).toBe(cargoA.quantity)
    expect(selectPackingContainer(state).length).toBe(container20.length)
    expect(state.automaticResult).toBe(calculatedResult)
  })

  it('copies cargo and container objects accepted by reducer actions', () => {
    const addedCargo = { ...cargoA, id: 'caller-owned-cargo' }
    const selectedContainer = { ...container40 }
    let state = packingSessionReducer(makeCalculatedState(), {
      type: 'cargoAdded',
      items: [addedCargo],
    })
    state = packingSessionReducer(state, {
      type: 'containerChanged',
      container: selectedContainer,
    })

    addedCargo.quantity = 99
    selectedContainer.length = 99

    expect(state.cargoItems.at(-1)?.quantity).toBe(cargoA.quantity)
    expect(selectPackingContainer(state).length).toBe(container40.length)
    expect(state.automaticResult).toBeNull()
  })
})
