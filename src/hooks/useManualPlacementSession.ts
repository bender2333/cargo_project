import { useCallback, useLayoutEffect, useMemo, useReducer } from 'react'
import { createClientId } from '../lib/clientId'
import {
  addBox,
  buildPool,
  dryRunRotation,
  isBlockingManualIssue,
  makeManualBox,
  removeBox,
  rotateBoxDown90,
  rotateBoxLeft90,
  rotateBoxRight90,
  rotateBoxUp90,
  setBoxPosition,
  toPlacedBoxes,
  validateBox,
  validateDraft,
} from '../lib/manualPlacement'
import type {
  ManualDraft,
  ManualPlacedBox,
  ManualRotationDirection,
  ValidationIssue,
} from '../lib/manualPlacement'
import {
  createManualPlacementSessionState,
  manualPlacementSessionReducer,
  reconcileManualPlacementSessionState,
} from '../lib/manualPlacementSession'
import type {
  ManualPlacementMode,
  ManualPlacementSessionState,
} from '../lib/manualPlacementSession'
import { buildManualPackingResult } from '../lib/manualSteps'
import { baseDimensionsFromPlaced } from '../lib/orientationTransform'
import {
  DEFAULT_PLACEMENT_SETTINGS,
  type SupportPolicy,
} from '../lib/placementSettings'
import { quickPlaceCargo } from '../lib/quickPlace'
import type { CargoItem, ContainerSpec, PackingResult } from '../types'

export type ManualPlacementOperation =
  | 'set-mode'
  | 'select'
  | 'commit'
  | 'move'
  | 'drop'
  | 'quick-place'
  | 'rotate'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'continue-from-automatic'

export type ManualPlacementFailureReason =
  | 'missing-box'
  | 'missing-cargo'
  | 'quantity-limit'
  | 'validation-failed'
  | 'no-space'
  | 'history-empty'

type ManualPlacementCommandContext = {
  boxId?: string
  cargoId?: string
  issues?: ValidationIssue[]
  rotatedBox?: ManualPlacedBox | null
}

export type ManualPlacementCommandSuccess = {
  ok: true
  operation: ManualPlacementOperation
  changed: boolean
  boxId?: string
  cargoId?: string
  issues: ValidationIssue[]
  rotatedBox?: ManualPlacedBox | null
}

export type ManualPlacementCommandFailure = {
  ok: false
  operation: ManualPlacementOperation
  changed: false
  reason: ManualPlacementFailureReason
  boxId?: string
  cargoId?: string
  issues: ValidationIssue[]
  rotatedBox?: ManualPlacedBox | null
}

export type ManualPlacementCommandResult =
  | ManualPlacementCommandSuccess
  | ManualPlacementCommandFailure

export type CreateManualPlacementId = (sourceId?: string) => string

export type UseManualPlacementSessionOptions = {
  cargoItems: CargoItem[]
  container: ContainerSpec
  automaticDisplayResult: PackingResult
  supportPolicy?: SupportPolicy
  createId?: CreateManualPlacementId
  initialState?: Partial<ManualPlacementSessionState>
}

function commandSuccess(
  operation: ManualPlacementOperation,
  changed: boolean,
  context: ManualPlacementCommandContext = {},
): ManualPlacementCommandSuccess {
  return {
    ok: true,
    operation,
    changed,
    boxId: context.boxId,
    cargoId: context.cargoId,
    issues: context.issues ?? [],
    rotatedBox: context.rotatedBox,
  }
}

function commandFailure(
  operation: ManualPlacementOperation,
  reason: ManualPlacementFailureReason,
  context: ManualPlacementCommandContext = {},
): ManualPlacementCommandFailure {
  return {
    ok: false,
    operation,
    changed: false,
    reason,
    boxId: context.boxId,
    cargoId: context.cargoId,
    issues: context.issues ?? [],
    rotatedBox: context.rotatedBox,
  }
}

function defaultCreateId(sourceId?: string) {
  return sourceId ? `manual-${sourceId}` : `manual-${createClientId()}`
}

function rotateDraft(draft: ManualDraft, boxId: string, direction: ManualRotationDirection) {
  if (direction === 'left') return rotateBoxLeft90(draft, boxId)
  if (direction === 'down') return rotateBoxDown90(draft, boxId)
  if (direction === 'up') return rotateBoxUp90(draft, boxId)
  return rotateBoxRight90(draft, boxId)
}

export function useManualPlacementSession(options: UseManualPlacementSessionOptions) {
  const {
    cargoItems,
    container,
    automaticDisplayResult,
    supportPolicy = DEFAULT_PLACEMENT_SETTINGS.supportPolicy,
    createId = defaultCreateId,
  } = options
  const cargoPlan = useMemo(
    () => cargoItems.map(({ id, quantity }) => ({ id, quantity })),
    [cargoItems],
  )
  const [state, dispatch] = useReducer(
    manualPlacementSessionReducer,
    options.initialState ?? {},
    (initial) => reconcileManualPlacementSessionState(
      createManualPlacementSessionState(initial),
      cargoPlan,
    ),
  )
  useLayoutEffect(() => {
    dispatch({ type: 'cargoPlanChanged', cargoPlan })
  }, [cargoPlan])
  const draft = state.history.present

  const pool = useMemo(
    () => buildPool(cargoItems, draft),
    [cargoItems, draft],
  )
  const issues = useMemo(
    () => validateDraft(draft, container, supportPolicy),
    [container, draft, supportPolicy],
  )
  const blockingInvalidBoxIds = useMemo(() => {
    const ids = new Set<string>()
    for (const issue of issues) {
      if (isBlockingManualIssue(issue)) ids.add(issue.boxId)
    }
    return ids
  }, [issues])
  const rawPlacedBoxes = useMemo(
    () => toPlacedBoxes(draft, blockingInvalidBoxIds),
    [blockingInvalidBoxIds, draft],
  )
  const manualResult = useMemo(
    () => buildManualPackingResult(rawPlacedBoxes, container, cargoItems),
    [cargoItems, container, rawPlacedBoxes],
  )
  const placedBoxes = manualResult.placed
  const activeResult = state.mode === 'manual' ? manualResult : automaticDisplayResult

  const setMode = useCallback((mode: ManualPlacementMode): ManualPlacementCommandResult => {
    const changed = mode !== state.mode
    dispatch({ type: 'modeSet', mode })
    return commandSuccess('set-mode', changed)
  }, [state.mode])

  const select = useCallback((boxId: string | null): ManualPlacementCommandResult => {
    if (boxId !== null && !draft.boxes.some((box) => box.id === boxId)) {
      return commandFailure('select', 'missing-box', { boxId })
    }
    const changed = boxId !== state.selectedId
    dispatch({ type: 'selectionSet', selectedId: boxId })
    return commandSuccess('select', changed, { boxId: boxId ?? undefined })
  }, [draft.boxes, state.selectedId])

  const commit = useCallback((nextDraft: ManualDraft): ManualPlacementCommandResult => {
    dispatch({ type: 'draftCommitted', draft: nextDraft, cargoPlan })
    return commandSuccess('commit', true)
  }, [cargoPlan])

  const move = useCallback((
    boxId: string,
    x: number,
    y: number,
    z?: number,
  ): ManualPlacementCommandResult => {
    const box = draft.boxes.find((candidate) => candidate.id === boxId)
    if (!box) return commandFailure('move', 'missing-box', { boxId })

    const clampedX = Math.max(0, Math.min(container.length - box.length, x))
    const clampedY = Math.max(0, Math.min(container.width - box.width, y))
    const clampedZ = z === undefined
      ? undefined
      : Math.max(0, Math.min(container.height - box.height, z))
    if (clampedX === box.x && clampedY === box.y && (clampedZ === undefined || clampedZ === box.z)) {
      return commandSuccess('move', false, { boxId })
    }
    const nextDraft = setBoxPosition(draft, boxId, clampedX, clampedY, clampedZ)
    const nextIssues = validateBox(nextDraft, boxId, container, supportPolicy)
    if (nextIssues.some(isBlockingManualIssue)) {
      return commandFailure('move', 'validation-failed', { boxId, issues: nextIssues })
    }

    dispatch({ type: 'draftCommitted', draft: nextDraft, cargoPlan })
    return commandSuccess('move', true, { boxId, issues: nextIssues })
  }, [cargoPlan, container, draft, supportPolicy])

  const drop = useCallback((
    cargoId: string,
    dropX: number,
    dropY: number,
    dropZ?: number,
  ): ManualPlacementCommandResult => {
    const cargo = cargoItems.find((item) => item.id === cargoId)
    if (!cargo) return commandFailure('drop', 'missing-cargo', { cargoId })
    const used = draft.boxes.filter((box) => box.cargoId === cargoId).length
    if (used >= cargo.quantity) {
      return commandFailure('drop', 'quantity-limit', { cargoId })
    }

    const boxId = createId()
    const hasDropZ = typeof dropZ === 'number'
    const x = hasDropZ ? dropX : Math.max(0, dropX - cargo.length / 2)
    const y = hasDropZ ? dropY : Math.max(0, dropY - cargo.width / 2)
    const nextDraft = addBox(draft, makeManualBox({
      id: boxId,
      cargoId,
      label: cargo.label ?? cargo.name,
      color: cargo.color,
      length: cargo.length,
      width: cargo.width,
      height: cargo.height,
      weight: cargo.weight,
      canRotate: cargo.canRotate,
      stackable: cargo.stackable,
      maxStackLayers: cargo.maxStackLayers,
      groundOnly: cargo.groundOnly,
      x,
      y,
      z: hasDropZ ? dropZ : 0,
    }))
    const nextIssues = validateBox(nextDraft, boxId, container, supportPolicy)
    if (nextIssues.some(isBlockingManualIssue)) {
      return commandFailure('drop', 'validation-failed', {
        boxId,
        cargoId,
        issues: nextIssues,
      })
    }

    dispatch({ type: 'draftCommitted', draft: nextDraft, selectedId: boxId, cargoPlan })
    return commandSuccess('drop', true, { boxId, cargoId, issues: nextIssues })
  }, [cargoItems, cargoPlan, container, createId, draft, supportPolicy])

  const quickPlace = useCallback((cargoId: string): ManualPlacementCommandResult => {
    const cargo = cargoItems.find((item) => item.id === cargoId)
    if (!cargo) return commandFailure('quick-place', 'missing-cargo', { cargoId })
    const result = quickPlaceCargo({
      cargo,
      draft,
      container,
      createId: () => createId(),
      supportPolicy,
    })
    if (!result.ok) {
      return commandFailure('quick-place', result.reason, { cargoId, issues: result.issues })
    }

    dispatch({
      type: 'draftCommitted',
      draft: result.nextDraft,
      selectedId: result.box.id,
      cargoPlan,
    })
    return commandSuccess('quick-place', true, {
      boxId: result.box.id,
      cargoId,
      issues: result.issues,
    })
  }, [cargoItems, cargoPlan, container, createId, draft, supportPolicy])

  const rotate = useCallback((
    boxId: string,
    direction: ManualRotationDirection = 'right',
  ): ManualPlacementCommandResult => {
    const box = draft.boxes.find((candidate) => candidate.id === boxId)
    if (!box) {
      return commandFailure('rotate', 'missing-box', { boxId })
    }
    const dryRun = dryRunRotation(draft, boxId, container, direction, supportPolicy)
    if (box.canRotate === false) {
      const rotationDisabledIssue: ValidationIssue = {
        type: 'rotation-disabled',
        severity: 'error',
        boxId,
        message: `Box ${box.label} cannot be rotated.`,
      }
      return commandFailure('rotate', 'validation-failed', {
        boxId,
        issues: [rotationDisabledIssue],
        rotatedBox: dryRun.rotatedBox,
      })
    }
    if (!dryRun.ok) {
      return commandFailure('rotate', 'validation-failed', {
        boxId,
        issues: dryRun.issues,
        rotatedBox: dryRun.rotatedBox,
      })
    }

    dispatch({ type: 'draftCommitted', draft: rotateDraft(draft, boxId, direction), cargoPlan })
    return commandSuccess('rotate', true, {
      boxId,
      issues: dryRun.issues,
      rotatedBox: dryRun.rotatedBox,
    })
  }, [cargoPlan, container, draft, supportPolicy])

  const deleteBox = useCallback((boxId: string): ManualPlacementCommandResult => {
    if (!draft.boxes.some((box) => box.id === boxId)) {
      return commandFailure('delete', 'missing-box', { boxId })
    }
    const nextDraft = removeBox(draft, boxId)
    const nextIssues = validateDraft(nextDraft, container, supportPolicy)
    dispatch({ type: 'draftCommitted', draft: nextDraft, selectedId: null, cargoPlan })
    return commandSuccess('delete', true, { boxId, issues: nextIssues })
  }, [cargoPlan, container, draft, supportPolicy])

  const undo = useCallback((): ManualPlacementCommandResult => {
    if (state.history.past.length === 0) {
      return commandFailure('undo', 'history-empty')
    }
    dispatch({ type: 'undo' })
    return commandSuccess('undo', true)
  }, [state.history.past.length])

  const redo = useCallback((): ManualPlacementCommandResult => {
    if (state.history.future.length === 0) {
      return commandFailure('redo', 'history-empty')
    }
    dispatch({ type: 'redo' })
    return commandSuccess('redo', true)
  }, [state.history.future.length])

  const continueFromAutomatic = useCallback((): ManualPlacementCommandResult => {
    const cargoById = new Map(cargoItems.map((cargo) => [cargo.id, cargo]))
    const nextDraft: ManualDraft = {
      boxes: automaticDisplayResult.placed.map((box) => {
        const cargo = cargoById.get(box.cargoId)
        const base = baseDimensionsFromPlaced(box)
        return {
          ...makeManualBox({
            id: createId(box.id),
            cargoId: box.cargoId,
            label: box.label,
            color: box.color,
            length: base.length,
            width: base.width,
            height: base.height,
            weight: box.weight,
            canRotate: cargo?.canRotate ?? box.canRotate,
            stackable: cargo?.stackable ?? box.stackable,
            maxStackLayers: cargo?.maxStackLayers ?? box.maxStackLayers,
            groundOnly: cargo?.groundOnly ?? box.groundOnly,
            x: box.x,
            y: box.y,
            z: box.z,
          }),
          length: box.length,
          width: box.width,
          height: box.height,
          orientationKey: box.orientationKey,
          labelRotationDeg: box.labelRotationDeg,
          yawQuarterTurn: box.yawQuarterTurn,
          pitchQuarterTurn: box.pitchQuarterTurn,
          orientationAxes: box.orientationAxes ? { ...box.orientationAxes } : undefined,
          orientationLabel: box.orientationLabel,
        }
      }),
    }
    dispatch({ type: 'continuedFromAutomatic', draft: nextDraft, cargoPlan })
    return commandSuccess('continue-from-automatic', true)
  }, [automaticDisplayResult, cargoItems, cargoPlan, createId])

  return {
    state,
    mode: state.mode,
    history: state.history,
    draft,
    selectedId: state.selectedId,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    pool,
    issues,
    blockingInvalidBoxIds,
    placedBoxes,
    manualResult,
    activeResult,
    setMode,
    select,
    commit,
    move,
    drop,
    quickPlace,
    rotate,
    deleteBox,
    undo,
    redo,
    continueFromAutomatic,
  }
}
