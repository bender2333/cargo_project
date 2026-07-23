import { describe, expect, it } from 'vitest'
import {
  addBox,
  emptyDraft,
  makeManualBox,
} from './manualPlacement'
import {
  createManualPlacementSessionState,
  manualPlacementSessionReducer,
  reconcileManualPlacementSessionState,
} from './manualPlacementSession'

function box(id: string, cargoId = 'cargo-a') {
  return makeManualBox({
    id,
    cargoId,
    label: 'A',
    color: '#f59e0b',
    length: 400,
    width: 400,
    height: 400,
    x: 0,
    y: 0,
  })
}

const cargoPlan = [{ id: 'cargo-a', quantity: 2 }]

describe('manualPlacementSessionReducer', () => {
  it('commits a draft and its selection as one state transition', () => {
    const initial = createManualPlacementSessionState()
    const draft = addBox(emptyDraft(), box('box-1'))

    const next = manualPlacementSessionReducer(initial, {
      type: 'draftCommitted',
      draft,
      selectedId: 'box-1',
      cargoPlan,
    })

    expect(next.history.present).toEqual(draft)
    expect(next.history.past).toEqual([initial.history.present])
    expect(next.selectedId).toBe('box-1')
  })

  it('clears a selection that no longer exists after undo and does not revive it on redo', () => {
    const firstDraft = addBox(emptyDraft(), box('box-1'))
    const secondDraft = addBox(firstDraft, { ...box('box-2'), x: 400 })
    const withFirst = manualPlacementSessionReducer(createManualPlacementSessionState(), {
      type: 'draftCommitted',
      draft: firstDraft,
      selectedId: 'box-1',
      cargoPlan,
    })
    const withSecond = manualPlacementSessionReducer(withFirst, {
      type: 'draftCommitted',
      draft: secondDraft,
      selectedId: 'box-2',
      cargoPlan,
    })

    const undone = manualPlacementSessionReducer(withSecond, { type: 'undo' })
    const redone = manualPlacementSessionReducer(undone, { type: 'redo' })

    expect(undone.history.present.boxes.map((candidate) => candidate.id)).toEqual(['box-1'])
    expect(undone.selectedId).toBeNull()
    expect(redone.history.present.boxes.map((candidate) => candidate.id)).toEqual(['box-1', 'box-2'])
    expect(redone.selectedId).toBeNull()
  })

  it('continues from an automatic draft by committing, switching mode, and clearing selection atomically', () => {
    const selectedDraft = addBox(emptyDraft(), box('old-box'))
    const selected = manualPlacementSessionReducer(createManualPlacementSessionState(), {
      type: 'draftCommitted',
      draft: selectedDraft,
      selectedId: 'old-box',
      cargoPlan,
    })
    const automaticDraft = addBox(emptyDraft(), box('automatic-box'))

    const next = manualPlacementSessionReducer(selected, {
      type: 'continuedFromAutomatic',
      draft: automaticDraft,
      cargoPlan,
    })

    expect(next.mode).toBe('manual')
    expect(next.selectedId).toBeNull()
    expect(next.history.present).toEqual(automaticDraft)
    expect(next.history.past.at(-1)).toEqual(selectedDraft)
  })

  it('trims past, present, and future to current cargo quantities so history cannot revive removed boxes', () => {
    const pumpOne = box('pump-1')
    const pumpTwo = { ...box('pump-2'), x: 400 }
    const valve = { ...box('valve-1', 'cargo-b'), x: 800 }
    const state = createManualPlacementSessionState({
      mode: 'manual',
      history: {
        past: [{ boxes: [pumpOne, valve] }],
        present: { boxes: [pumpOne, pumpTwo, valve] },
        future: [{ boxes: [pumpOne, valve] }],
      },
      selectedId: 'valve-1',
    })

    const reconciled = reconcileManualPlacementSessionState(state, [
      { id: 'cargo-a', quantity: 1 },
    ])

    expect(reconciled.history.past[0].boxes.map((candidate) => candidate.id)).toEqual(['pump-1'])
    expect(reconciled.history.present.boxes.map((candidate) => candidate.id)).toEqual(['pump-1'])
    expect(reconciled.history.future[0].boxes.map((candidate) => candidate.id)).toEqual(['pump-1'])
    expect(reconciled.selectedId).toBeNull()

    const redone = manualPlacementSessionReducer(reconciled, { type: 'redo' })
    expect(redone.history.present.boxes.map((candidate) => candidate.id)).toEqual(['pump-1'])
  })

  it('preserves state identity and a valid selection when the cargo plan already covers every box', () => {
    const draft = { boxes: [box('pump-1'), { ...box('pump-2'), x: 400 }] }
    const state = createManualPlacementSessionState({
      mode: 'manual',
      history: { past: [], present: draft, future: [] },
      selectedId: 'pump-1',
    })

    const reconciled = reconcileManualPlacementSessionState(state, [
      { id: 'cargo-a', quantity: 2 },
    ])

    expect(reconciled).toBe(state)
    expect(reconciled.history).toBe(state.history)
    expect(reconciled.selectedId).toBe('pump-1')
  })

  it('clips a newly committed draft in the same reducer transition', () => {
    const initial = createManualPlacementSessionState()
    const next = manualPlacementSessionReducer(initial, {
      type: 'draftCommitted',
      draft: { boxes: [box('pump-1'), box('pump-2'), box('orphan', 'deleted-cargo')] },
      cargoPlan: [{ id: 'cargo-a', quantity: 1 }],
    })

    expect(next.history.present.boxes.map((candidate) => candidate.id)).toEqual(['pump-1'])
  })

  it('rejects a stale selection that no longer exists after an undo in the same batch', () => {
    const firstDraft = addBox(emptyDraft(), box('box-1'))
    const secondDraft = addBox(firstDraft, { ...box('box-2'), x: 400 })
    const state = createManualPlacementSessionState({
      history: { past: [firstDraft], present: secondDraft, future: [] },
      selectedId: 'box-1',
    })

    const undone = manualPlacementSessionReducer(state, { type: 'undo' })
    const staleSelection = manualPlacementSessionReducer(undone, {
      type: 'selectionSet',
      selectedId: 'box-2',
    })

    expect(staleSelection.history.present.boxes.map((candidate) => candidate.id)).toEqual(['box-1'])
    expect(staleSelection.selectedId).toBeNull()
  })
})
