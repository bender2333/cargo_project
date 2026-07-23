import { startTransition } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import { usePackingSession } from './usePackingSession'

const container: ContainerSpec = {
  id: 'stack-test',
  label: 'Stack test',
  description: 'Forces identical boxes to stack vertically',
  length: 1000,
  width: 1000,
  height: 2000,
  maxWeight: 10000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

const cargo: CargoItem = {
  id: 'stacked-cargo',
  name: 'Stacked cargo',
  label: 'S',
  length: 1000,
  width: 1000,
  height: 1000,
  weight: 100,
  quantity: 2,
  color: '#f59e0b',
  canRotate: false,
  stackable: true,
}

describe('usePackingSession', () => {
  it('initializes the automatic result with the complete session rule snapshot', () => {
    const { result } = renderHook(() => usePackingSession({
      projectName: 'Initial project',
      shipmentName: '',
      cargoItems: [cargo],
      containerSnapshots: [container],
      selectedContainerId: container.id,
      loadingMode: 'quantity',
      defaultMaxStackLayers: 1,
    }))

    expect(result.current.state.automaticResult?.totalCargoCount).toBe(2)
    expect(result.current.state.automaticResult?.placedCount).toBe(1)
    expect(result.current.state.defaultMaxStackLayers).toBe(1)
  })

  it('recalculates from the latest dirty input snapshot', () => {
    const { result } = renderHook(() => usePackingSession({
      projectName: 'Initial project',
      shipmentName: '',
      cargoItems: [cargo],
      containerSnapshots: [container],
      selectedContainerId: container.id,
      loadingMode: 'quantity',
      defaultMaxStackLayers: 1,
    }))
    const addedCargo = { ...cargo, id: 'second-type', label: 'T', quantity: 1 }

    act(() => result.current.dispatch({ type: 'cargoAdded', items: [addedCargo] }))
    expect(result.current.state.automaticResult).toBeNull()

    act(() => result.current.calculate())

    expect(result.current.state.automaticResult?.totalCargoCount).toBe(3)
    expect(result.current.state.cargoItems.map((item) => item.id)).toEqual([
      'stacked-cargo',
      'second-type',
    ])
  })

  it('calculates from an input change dispatched in the same event', () => {
    const { result } = renderHook(() => usePackingSession({
      projectName: 'Initial project',
      shipmentName: '',
      cargoItems: [cargo],
      containerSnapshots: [container],
      selectedContainerId: container.id,
      loadingMode: 'quantity',
      defaultMaxStackLayers: 1,
    }))
    const addedCargo = { ...cargo, id: 'same-event-type', label: 'E', quantity: 1 }

    act(() => {
      result.current.dispatch({ type: 'cargoAdded', items: [addedCargo] })
      result.current.calculate()
    })

    expect(result.current.state.cargoItems).toHaveLength(2)
    expect(result.current.state.automaticResult?.totalCargoCount).toBe(3)
  })

  it('takes ownership of an action payload before queued React work runs', () => {
    const { result } = renderHook(() => usePackingSession({
      projectName: 'Initial project',
      shipmentName: '',
      cargoItems: [cargo],
      containerSnapshots: [container],
      selectedContainerId: container.id,
      loadingMode: 'quantity',
      defaultMaxStackLayers: 1,
    }))
    const addedCargo = { ...cargo, id: 'mutable-caller-type', label: 'M', quantity: 1 }

    act(() => {
      result.current.dispatch({ type: 'cargoAdded', items: [addedCargo] })
      addedCargo.quantity = 9
      result.current.calculate()
    })

    expect(result.current.state.cargoItems.at(-1)?.quantity).toBe(1)
    expect(result.current.state.automaticResult?.totalCargoCount).toBe(3)
  })

  it('recalculates the latest input when a transition commits after an urgent request', async () => {
    const { result } = renderHook(() => usePackingSession({
      projectName: 'Initial project',
      shipmentName: '',
      cargoItems: [cargo],
      containerSnapshots: [container],
      selectedContainerId: container.id,
      loadingMode: 'quantity',
      defaultMaxStackLayers: 1,
    }))
    const addedCargo = { ...cargo, id: 'transition-type', label: 'T', quantity: 1 }

    await act(async () => {
      startTransition(() => {
        result.current.dispatch({ type: 'cargoAdded', items: [addedCargo] })
      })
      result.current.calculate()
    })

    expect(result.current.state.cargoItems.map((item) => item.id)).toEqual([
      'stacked-cargo',
      'transition-type',
    ])
    expect(result.current.state.automaticResult?.totalCargoCount).toBe(3)
  })

  it('restores one complete history snapshot and calculates from its saved rules', () => {
    const { result } = renderHook(() => usePackingSession({
      projectName: 'Initial project',
      shipmentName: '',
      cargoItems: [cargo],
      containerSnapshots: [container],
      selectedContainerId: container.id,
      loadingMode: 'quantity',
      defaultMaxStackLayers: 1,
    }))
    const historyContainer = { ...container, id: 'history-container', label: 'History container' }
    const historyCargo = { ...cargo, id: 'history-cargo', quantity: 3 }
    const restoreHistory = (result.current as typeof result.current & {
      restoreHistory?: (snapshot: {
        projectName: string
        shipmentName: string
        container: ContainerSpec
        cargoItems: CargoItem[]
        loadingMode: 'volume'
        defaultMaxStackLayers?: number
      }) => void
    }).restoreHistory

    act(() => restoreHistory?.({
      projectName: 'Restored project',
      shipmentName: 'Restored shipment',
      container: historyContainer,
      cargoItems: [historyCargo],
      loadingMode: 'volume',
      defaultMaxStackLayers: 2,
    }))

    expect(result.current.state).toMatchObject({
      projectName: 'Restored project',
      shipmentName: 'Restored shipment',
      selectedContainerId: historyContainer.id,
      cargoItems: [historyCargo],
      loadingMode: 'volume',
      defaultMaxStackLayers: 2,
    })
    expect(result.current.state.automaticResult?.totalCargoCount).toBe(3)
    expect(result.current.state.automaticResult?.placedCount).toBe(2)
  })
})
