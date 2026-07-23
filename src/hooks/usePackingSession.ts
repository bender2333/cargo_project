import { useCallback, useEffect, useReducer } from 'react'
import type { Dispatch } from 'react'
import { normalizeCargoLabelColors } from '../lib/labels'
import { calculatePacking } from '../lib/packing'
import {
  createPackingSessionState,
  packingSessionReducer,
  selectPackingContainer,
} from '../lib/packingSession'
import type {
  PackingSessionDispatchAction,
  PackingSessionInitialState,
  PackingSessionRestoreInput,
  PackingSessionState,
} from '../lib/packingSession'

type PackingSessionOptions = Omit<PackingSessionInitialState, 'automaticResult'>

type PackingSessionController = {
  state: PackingSessionState
  dispatch: Dispatch<PackingSessionDispatchAction>
  calculate: () => void
  restoreHistory: (snapshot: PackingSessionRestoreInput) => void
}

function initializePackingSession(options: PackingSessionOptions): PackingSessionState {
  const state = createPackingSessionState({ ...options, automaticResult: null })
  const result = calculatePacking(
    selectPackingContainer(state),
    normalizeCargoLabelColors(state.cargoItems),
    {
      loadingMode: state.loadingMode,
      defaultMaxStackLayers: state.defaultMaxStackLayers,
    },
  )
  return { ...state, automaticResult: result }
}

function ownActionPayload(action: PackingSessionDispatchAction): PackingSessionDispatchAction {
  switch (action.type) {
    case 'cargoAdded':
    case 'cargoImported':
      return { ...action, items: action.items.map((item) => ({ ...item })) }
    case 'cargoEdited':
      return { ...action, item: { ...action.item } }
    case 'containerChanged':
      return { ...action, container: { ...action.container } }
    default:
      return { ...action }
  }
}

export function usePackingSession(options: PackingSessionOptions): PackingSessionController {
  const [state, reducerDispatch] = useReducer(packingSessionReducer, options, initializePackingSession)

  const dispatch = useCallback<Dispatch<PackingSessionDispatchAction>>((action) => {
    reducerDispatch(ownActionPayload(action))
  }, [])

  useEffect(() => {
    if (state.calculationRequestId === state.completedCalculationRequestId) return
    reducerDispatch({
      type: 'calculationCompleted',
      requestId: state.calculationRequestId,
      inputRevision: state.inputRevision,
      result: calculatePacking(
        selectPackingContainer(state),
        normalizeCargoLabelColors(state.cargoItems),
        {
          loadingMode: state.loadingMode,
          defaultMaxStackLayers: state.defaultMaxStackLayers,
        },
      ),
    })
  }, [state])

  const calculate = useCallback(() => {
    reducerDispatch({ type: 'calculationRequested' })
  }, [])

  const restoreHistory = useCallback((snapshot: PackingSessionRestoreInput) => {
    const ownedSnapshot = {
      ...snapshot,
      container: { ...snapshot.container },
      cargoItems: snapshot.cargoItems.map((item) => ({ ...item })),
    }
    const result = calculatePacking(
      ownedSnapshot.container,
      normalizeCargoLabelColors(ownedSnapshot.cargoItems),
      {
        loadingMode: ownedSnapshot.loadingMode,
        defaultMaxStackLayers: ownedSnapshot.defaultMaxStackLayers,
      },
    )
    reducerDispatch({
      type: 'historyRestored',
      snapshot: { ...ownedSnapshot, result },
    })
  }, [])

  return { state, dispatch, calculate, restoreHistory }
}
