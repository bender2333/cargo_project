import {
  commit as commitManualHistory,
  emptyHistory,
  redo as redoManualHistory,
  undo as undoManualHistory,
} from './manualPlacement'
import type { ManualDraft, ManualHistory } from './manualPlacement'

export type ManualPlacementMode = 'auto' | 'manual'
export type ManualCargoPlanItem = { id: string; quantity: number }

export type ManualPlacementSessionState = {
  mode: ManualPlacementMode
  history: ManualHistory
  selectedId: string | null
}

export type ManualPlacementSessionAction =
  | { type: 'modeSet'; mode: ManualPlacementMode }
  | { type: 'selectionSet'; selectedId: string | null }
  | { type: 'draftCommitted'; draft: ManualDraft; selectedId?: string | null; cargoPlan: ManualCargoPlanItem[] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'continuedFromAutomatic'; draft: ManualDraft; cargoPlan: ManualCargoPlanItem[] }
  | { type: 'cargoPlanChanged'; cargoPlan: ManualCargoPlanItem[] }

function selectionInDraft(selectedId: string | null, draft: ManualDraft) {
  if (selectedId === null) return null
  return draft.boxes.some((box) => box.id === selectedId) ? selectedId : null
}

function cargoQuantityLimits(cargoPlan: ManualCargoPlanItem[]) {
  return new Map(cargoPlan.map((cargo) => [
    cargo.id,
    Number.isFinite(cargo.quantity) ? Math.max(0, Math.floor(cargo.quantity)) : 0,
  ]))
}

function reconcileDraft(draft: ManualDraft, limits: Map<string, number>) {
  const used = new Map<string, number>()
  const boxes = draft.boxes.filter((box) => {
    const count = used.get(box.cargoId) ?? 0
    const keep = count < (limits.get(box.cargoId) ?? 0)
    if (keep) used.set(box.cargoId, count + 1)
    return keep
  })
  return boxes.length === draft.boxes.length ? draft : { ...draft, boxes }
}

export function reconcileManualPlacementSessionState(
  state: ManualPlacementSessionState,
  cargoPlan: ManualCargoPlanItem[],
): ManualPlacementSessionState {
  const limits = cargoQuantityLimits(cargoPlan)
  const past = state.history.past.map((draft) => reconcileDraft(draft, limits))
  const present = reconcileDraft(state.history.present, limits)
  const future = state.history.future.map((draft) => reconcileDraft(draft, limits))
  const historyChanged = past.some((draft, index) => draft !== state.history.past[index])
    || present !== state.history.present
    || future.some((draft, index) => draft !== state.history.future[index])
  const history = historyChanged ? { past, present, future } : state.history
  const selectedId = selectionInDraft(state.selectedId, history.present)
  return history === state.history && selectedId === state.selectedId
    ? state
    : { ...state, history, selectedId }
}

export function createManualPlacementSessionState(
  initial: Partial<ManualPlacementSessionState> = {},
): ManualPlacementSessionState {
  const history = initial.history ?? emptyHistory()
  return {
    mode: initial.mode ?? 'auto',
    history,
    selectedId: selectionInDraft(initial.selectedId ?? null, history.present),
  }
}

export function manualPlacementSessionReducer(
  state: ManualPlacementSessionState,
  action: ManualPlacementSessionAction,
): ManualPlacementSessionState {
  switch (action.type) {
    case 'modeSet':
      return action.mode === state.mode ? state : { ...state, mode: action.mode }
    case 'selectionSet':
      {
        const selectedId = selectionInDraft(action.selectedId, state.history.present)
        return selectedId === state.selectedId
          ? state
          : { ...state, selectedId }
      }
    case 'draftCommitted': {
      const history = commitManualHistory(state.history, action.draft)
      const requestedSelection = 'selectedId' in action ? action.selectedId ?? null : state.selectedId
      const next = {
        ...state,
        history,
        selectedId: selectionInDraft(requestedSelection, history.present),
      }
      return reconcileManualPlacementSessionState(next, action.cargoPlan)
    }
    case 'undo': {
      const history = undoManualHistory(state.history)
      const selectedId = selectionInDraft(state.selectedId, history.present)
      if (history === state.history && selectedId === state.selectedId) return state
      return { ...state, history, selectedId }
    }
    case 'redo': {
      const history = redoManualHistory(state.history)
      const selectedId = selectionInDraft(state.selectedId, history.present)
      if (history === state.history && selectedId === state.selectedId) return state
      return { ...state, history, selectedId }
    }
    case 'continuedFromAutomatic': {
      const next: ManualPlacementSessionState = {
        mode: 'manual',
        history: commitManualHistory(state.history, action.draft),
        selectedId: null,
      }
      return reconcileManualPlacementSessionState(next, action.cargoPlan)
    }
    case 'cargoPlanChanged':
      return reconcileManualPlacementSessionState(state, action.cargoPlan)
  }
}
