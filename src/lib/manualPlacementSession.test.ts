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

  it('reconciles only the incoming draft during an ordinary commit', () => {
    const historicalDraft = { boxes: [box('historical-b', 'cargo-b')] }
    const state = createManualPlacementSessionState({
      history: {
        past: [historicalDraft],
        present: { boxes: [box('current-a')] },
        future: [],
      },
    })

    const next = manualPlacementSessionReducer(state, {
      type: 'draftCommitted',
      draft: { boxes: [box('next-a'), box('excess-a')] },
      cargoPlan: [{ id: 'cargo-a', quantity: 1 }],
    })

    expect(next.history.past[0]).toBe(historicalDraft)
    expect(next.history.past[0].boxes.map((candidate) => candidate.id)).toEqual(['historical-b'])
    expect(next.history.present.boxes.map((candidate) => candidate.id)).toEqual(['next-a'])
  })

  it('restores a snapshot draft against its snapshot cargo plan rather than the current plan', () => {
    const current = reconcileManualPlacementSessionState(
      createManualPlacementSessionState(),
      [{ id: 'cargo-b', quantity: 1 }],
    )
    const restoredDraft = {
      boxes: [
        { ...box('snapshot-a-1'), x: 25, orientationKey: 'WLH' as const },
        { ...box('snapshot-a-2'), x: 425, orientationKey: 'WLH' as const },
      ],
    }

    const restored = manualPlacementSessionReducer(current, {
      type: 'historyDraftRestored',
      draft: restoredDraft,
      mode: 'manual',
      draftInitialized: true,
      snapshotCargoPlan: [{ id: 'cargo-a', quantity: 2 }],
    })

    expect(restored.history.present.boxes).toEqual(restoredDraft.boxes)
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

// P1-4 RED tests — cargo edit sync

describe('cargo attribute sync on reconcile', () => {
  it('updates weight in placed boxes when cargo weight changes', () => {
    const draft = addBox(emptyDraft(), box('b1'))
    const state = createManualPlacementSessionState({
      mode: 'manual',
      history: { past: [], present: draft, future: [] },
    })

    const reconciled = reconcileManualPlacementSessionState(state, [
      { id: 'cargo-a', quantity: 2, weight: 99, stackable: true, maxStackLayers: undefined, groundOnly: undefined },
    ])

    expect(reconciled.history.present.boxes[0].weight).toBe(99)
  })

  it('updates stackable and maxStackLayers when cargo rules change', () => {
    const draft = addBox(emptyDraft(), { ...box('b1'), stackable: true, maxStackLayers: undefined })
    const state = createManualPlacementSessionState({
      mode: 'manual',
      history: { past: [], present: draft, future: [] },
    })

    const reconciled = reconcileManualPlacementSessionState(state, [
      { id: 'cargo-a', quantity: 2, weight: 10, stackable: false, maxStackLayers: 2, groundOnly: undefined },
    ])

    expect(reconciled.history.present.boxes[0].stackable).toBe(false)
    expect(reconciled.history.present.boxes[0].maxStackLayers).toBe(2)
  })

  it('preserves state identity when attributes have not changed', () => {
    const draft = addBox(emptyDraft(), { ...box('b1'), weight: 10, stackable: true })
    const state = createManualPlacementSessionState({
      mode: 'manual',
      history: { past: [], present: draft, future: [] },
    })

    const reconciled = reconcileManualPlacementSessionState(state, [
      { id: 'cargo-a', quantity: 2, weight: 10, stackable: true, maxStackLayers: undefined, groundOnly: undefined },
    ])

    // No attribute change → same reference
    expect(reconciled).toBe(state)
  })

  it('syncs attribute changes through past and future history snapshots', () => {
    const oldBox = { ...box('b1'), weight: 5 }
    const state = createManualPlacementSessionState({
      mode: 'manual',
      history: {
        past: [addBox(emptyDraft(), oldBox)],
        present: addBox(emptyDraft(), { ...oldBox, x: 400 }),
        future: [addBox(emptyDraft(), { ...oldBox, x: 800 })],
      },
    })

    const reconciled = reconcileManualPlacementSessionState(state, [
      { id: 'cargo-a', quantity: 2, weight: 42, stackable: true, maxStackLayers: undefined, groundOnly: undefined },
    ])

    expect(reconciled.history.past[0].boxes[0].weight).toBe(42)
    expect(reconciled.history.present.boxes[0].weight).toBe(42)
    expect(reconciled.history.future[0].boxes[0].weight).toBe(42)
  })

  it('canonicalizes every pose field and dimension when rotation becomes forbidden', () => {
    const draft = addBox(emptyDraft(), {
      ...box('b1'),
      baseLength: 400,
      baseWidth: 300,
      baseHeight: 200,
      length: 300,
      width: 200,
      height: 400,
      orientationKey: 'WHL',
      labelRotationDeg: 270,
      yawQuarterTurn: 1,
      pitchQuarterTurn: 1,
      orientationAxes: { x: 'W+', y: 'H-', z: 'L-' },
      orientationLabel: 'X:W+ Y:T- Z:L-',
      canRotate: true,
    })
    const state = createManualPlacementSessionState({
      mode: 'manual',
      history: { past: [], present: draft, future: [] },
      draftInitialized: true,
    })

    const reconciled = reconcileManualPlacementSessionState(state, [
      {
        id: 'cargo-a',
        quantity: 2,
        length: 500,
        width: 300,
        height: 200,
        canRotate: false,
        weight: 10,
        stackable: true,
      },
    ])

    expect(reconciled.history.present.boxes[0]).toMatchObject({
      baseLength: 500,
      baseWidth: 300,
      baseHeight: 200,
      length: 500,
      width: 300,
      height: 200,
      orientationKey: 'LWH',
      labelRotationDeg: 0,
      yawQuarterTurn: 0,
      pitchQuarterTurn: 0,
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
      orientationLabel: 'X:L+ Y:W+ Z:T+',
      canRotate: false,
    })
  })
})
