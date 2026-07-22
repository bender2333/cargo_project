import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Dispatch } from 'react'
import { normalizeCargoLabelColors } from '../lib/labels'
import { calculatePacking } from '../lib/packing'
import {
  createPackingSessionState,
  packingSessionReducer,
  selectPackingContainer,
} from '../lib/packingSession'
import type {
  PackingSessionAction,
  PackingSessionInitialState,
  PackingSessionState,
} from '../lib/packingSession'

type PackingSessionOptions = Omit<PackingSessionInitialState, 'automaticResult'>

type PackingSessionController = {
  state: PackingSessionState
  dispatch: Dispatch<PackingSessionAction>
  calculate: () => void
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

function ownActionPayload(action: PackingSessionAction): PackingSessionAction {
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
  const [calculationRequestId, requestCalculation] = useReducer((requestId: number) => requestId + 1, 0)
  const handledCalculationRequestId = useRef(0)

  const dispatch = useCallback<Dispatch<PackingSessionAction>>((action) => {
    reducerDispatch(ownActionPayload(action))
  }, [])

  useEffect(() => {
    if (calculationRequestId === 0 || handledCalculationRequestId.current === calculationRequestId) return
    handledCalculationRequestId.current = calculationRequestId
    dispatch({
      type: 'calculationCompleted',
      result: calculatePacking(
        selectPackingContainer(state),
        normalizeCargoLabelColors(state.cargoItems),
        {
          loadingMode: state.loadingMode,
          defaultMaxStackLayers: state.defaultMaxStackLayers,
        },
      ),
    })
  }, [calculationRequestId, dispatch, state])

  const calculate = useCallback(() => requestCalculation(), [])

  return { state, dispatch, calculate }
}
