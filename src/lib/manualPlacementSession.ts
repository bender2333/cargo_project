import {
  commit as commitManualHistory,
  dimensionsForManualOrientation,
  emptyHistory,
  redo as redoManualHistory,
  undo as undoManualHistory,
} from './manualPlacement'
import type { ManualDraft, ManualHistory, ManualPlacedBox, OrientationKey } from './manualPlacement'

export type ManualPlacementMode = 'auto' | 'manual'

export type ManualCargoPlanItem = {
  id: string
  quantity: number
  weight?: number
  length?: number
  width?: number
  height?: number
  canRotate?: boolean
  stackable?: boolean
  maxStackLayers?: number
  groundOnly?: boolean
}

export type ManualPlacementSessionState = {
  mode: ManualPlacementMode
  history: ManualHistory
  selectedId: string | null
  /** Explicit init flag — never infer user intent from empty box count. */
  draftInitialized: boolean
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

function effectiveMaxStackLayers(cargo: ManualCargoPlanItem) {
  if ('maxStackLayers' in cargo) return cargo.maxStackLayers
  return undefined
}

function syncBoxGeometry(box: ManualPlacedBox, cargo: ManualCargoPlanItem): ManualPlacedBox {
  const nextWeight = cargo.weight ?? box.weight
  const nextStackable = cargo.stackable ?? box.stackable
  const nextMaxStackLayers = effectiveMaxStackLayers(cargo)
  const nextGroundOnly = 'groundOnly' in cargo ? cargo.groundOnly : box.groundOnly
  const nextCanRotate = cargo.canRotate ?? box.canRotate

  const baseLength = cargo.length ?? box.baseLength ?? box.length
  const baseWidth = cargo.width ?? box.baseWidth ?? box.width
  const baseHeight = cargo.height ?? box.baseHeight ?? box.height

  let orientationKey = box.orientationKey
  // Only collapse orientation when the cargo rule newly forbids rotation.
  if (box.canRotate !== false && nextCanRotate === false && orientationKey !== 'LWH') {
    orientationKey = 'LWH'
  }

  const sized = dimensionsForManualOrientation(
    { length: baseLength, width: baseWidth, height: baseHeight },
    orientationKey as OrientationKey,
  )

  if (
    nextWeight === box.weight
    && nextStackable === box.stackable
    && nextMaxStackLayers === box.maxStackLayers
    && nextGroundOnly === box.groundOnly
    && nextCanRotate === box.canRotate
    && baseLength === (box.baseLength ?? box.length)
    && baseWidth === (box.baseWidth ?? box.width)
    && baseHeight === (box.baseHeight ?? box.height)
    && sized.length === box.length
    && sized.width === box.width
    && sized.height === box.height
    && orientationKey === box.orientationKey
  ) {
    return box
  }

  return {
    ...box,
    weight: nextWeight,
    stackable: nextStackable,
    maxStackLayers: nextMaxStackLayers,
    groundOnly: nextGroundOnly,
    canRotate: nextCanRotate,
    baseLength,
    baseWidth,
    baseHeight,
    length: sized.length,
    width: sized.width,
    height: sized.height,
    orientationKey,
  }
}
function reconcileDraft(draft: ManualDraft, limits: Map<string, number>, attrs: Map<string, ManualCargoPlanItem>) {
  const used = new Map<string, number>()
  let attrChanged = false
  const boxes = draft.boxes.filter((box) => {
    const count = used.get(box.cargoId) ?? 0
    const keep = count < (limits.get(box.cargoId) ?? 0)
    if (keep) used.set(box.cargoId, count + 1)
    return keep
  }).map((box) => {
    const cargo = attrs.get(box.cargoId)
    if (!cargo) return box
    const next = syncBoxGeometry(box, cargo)
    if (next !== box) attrChanged = true
    return next
  })
  const countChanged = boxes.length !== draft.boxes.length
  return countChanged || attrChanged ? { ...draft, boxes } : draft
}

export function reconcileManualPlacementSessionState(
  state: ManualPlacementSessionState,
  cargoPlan: ManualCargoPlanItem[],
): ManualPlacementSessionState {
  const limits = cargoQuantityLimits(cargoPlan)
  const attrs = new Map(cargoPlan.map((item) => [item.id, item]))
  const past = state.history.past.map((draft) => reconcileDraft(draft, limits, attrs))
  const present = reconcileDraft(state.history.present, limits, attrs)
  const future = state.history.future.map((draft) => reconcileDraft(draft, limits, attrs))
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
    draftInitialized: initial.draftInitialized
      ?? (history.present.boxes.length > 0 || history.past.length > 0 || history.future.length > 0),
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
      const next: ManualPlacementSessionState = {
        ...state,
        history,
        selectedId: selectionInDraft(requestedSelection, history.present),
        draftInitialized: true,
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
        draftInitialized: true,
      }
      return reconcileManualPlacementSessionState(next, action.cargoPlan)
    }
    case 'cargoPlanChanged':
      return reconcileManualPlacementSessionState(state, action.cargoPlan)
  }
}
