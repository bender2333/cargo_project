import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CargoItem, ContainerSpec, PackingResult, PlacedBox } from '../types'
import { addBox, emptyDraft, makeManualBox, type ManualDraft, type ManualPlacedBox } from '../lib/manualPlacement'
import { renderedFootprint } from '../lib/renderedFootprint'
import { useManualPlacementSession } from './useManualPlacementSession'
import type { ManualPlacementCommandResult } from './useManualPlacementSession'

const container: ContainerSpec = {
  id: 'manual-test',
  label: 'Manual test',
  description: '',
  length: 2000,
  width: 1000,
  height: 1600,
  maxWeight: 10_000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'cargo-a',
    name: 'Industrial pump',
    label: 'P',
    length: 400,
    width: 400,
    height: 400,
    weight: 25,
    quantity: 2,
    color: '#f59e0b',
    canRotate: true,
    stackable: true,
    ...overrides,
  }
}

function placedBox(overrides: Partial<PlacedBox> = {}): PlacedBox {
  return {
    id: 'auto-box-1',
    cargoId: 'cargo-a',
    name: 'Industrial pump',
    label: 'P',
    index: 1,
    x: 125,
    y: 250,
    z: 375,
    length: 700,
    width: 500,
    height: 300,
    orientationKey: 'WHL',
    labelRotationDeg: 270,
    yawQuarterTurn: 1,
    pitchQuarterTurn: 1,
    orientationAxes: { x: 'W+', y: 'H-', z: 'L-' },
    orientationLabel: 'X:W+ Y:T- Z:L-',
    weight: 25,
    color: '#f59e0b',
    canRotate: true,
    stackable: true,
    depthLayer: 1,
    maxStackLayers: 8,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    ...overrides,
  }
}

function automaticResult(placed: PlacedBox[] = []): PackingResult {
  return {
    placed,
    unplaced: [],
    layers: [],
    workSteps: [],
    labelStats: [],
    diagnostics: [],
    totalCargoCount: 99,
    placedCount: placed.length,
    usedVolume: 0,
    containerVolume: 1,
    volumeUtilization: 0,
    usedWeight: 0,
    weightUtilization: 0,
  }
}

function manualBox(id: string, cargoId = 'cargo-a', x = 0, z = 0) {
  return makeManualBox({
    id,
    cargoId,
    label: cargoId === 'cargo-a' ? 'P' : 'V',
    color: cargoId === 'cargo-a' ? '#f59e0b' : '#2563eb',
    length: 400,
    width: 400,
    height: 400,
    weight: 25,
    x,
    y: 0,
    z,
  })
}

describe('useManualPlacementSession', () => {
  it('derives the pool and a complete manual result from planned cargo quantities', () => {
    const cargoItems = [
      cargo(),
      cargo({ id: 'cargo-b', name: 'Control valve', label: 'V', quantity: 1, color: '#2563eb' }),
    ]
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems,
      container,
      automaticDisplayResult: automaticResult(),
      createId: () => 'unused',
    }))
    const draft = addBox(addBox(emptyDraft(), manualBox('pump-1')), manualBox('pump-2', 'cargo-a', 400))

    act(() => {
      expect(result.current.commit(draft)).toMatchObject({ ok: true, operation: 'commit' })
      result.current.setMode('manual')
    })

    expect(result.current.pool.map((entry) => [entry.cargoId, entry.remaining])).toEqual([
      ['cargo-a', 0],
      ['cargo-b', 1],
    ])
    expect(result.current.placedBoxes.map((box) => [box.name, box.index])).toEqual([
      ['Industrial pump', 1],
      ['Industrial pump', 2],
    ])
    expect(result.current.manualResult).toMatchObject({
      totalCargoCount: 3,
      placedCount: 2,
      unplaced: [{
        cargoId: 'cargo-b',
        name: 'Control valve',
        label: 'V',
        quantity: 1,
        reasonCode: 'manual-not-placed',
      }],
    })
    expect(result.current.manualResult.labelStats).toEqual([
      expect.objectContaining({ label: 'P', name: 'Industrial pump', planned: 2, placed: 2, unplaced: 0 }),
      expect.objectContaining({ label: 'V', name: 'Control valve', planned: 1, placed: 0, unplaced: 1 }),
    ])
  })

  it('auto-seeds the manual draft from automatic result when switching to manual for the first time', () => {
    // PRD 11.1.1: switching to manual should preserve the current automatic result
    // as the initial draft — the previous behaviour (empty draft) was wrong.
    const automatic = automaticResult([placedBox()])
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo()],
      container,
      automaticDisplayResult: automatic,
    }))

    expect(result.current.activeResult).toBe(automatic)

    act(() => {
      expect(result.current.setMode('manual')).toMatchObject({ ok: true, operation: 'set-mode' })
    })

    // After switching, the draft is seeded with the automatic placed boxes.
    expect(result.current.mode).toBe('manual')
    expect(result.current.activeResult).toBe(result.current.manualResult)
    expect(result.current.activeResult).not.toBe(automatic)
    // The placed count should match automatic (one box was seeded)
    expect(result.current.draft.boxes).toHaveLength(1)
    expect(result.current.activeResult.totalCargoCount).toBe(2)
  })

  it('commits successful drops, selects the new box, and rejects quantity overflow without history changes', () => {
    const createId = vi.fn()
      .mockReturnValueOnce('manual-1')
      .mockReturnValueOnce('manual-2')
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ groundOnly: true })],
      container,
      automaticDisplayResult: automaticResult(),
      createId,
    }))

    let firstResult: ReturnType<typeof result.current.drop>
    act(() => { firstResult = result.current.drop('cargo-a', 200, 200) })
    expect(firstResult!).toMatchObject({ ok: true, operation: 'drop', boxId: 'manual-1' })
    expect(result.current.selectedId).toBe('manual-1')
    expect(result.current.draft.boxes[0].groundOnly).toBe(true)

    act(() => { result.current.drop('cargo-a', 800, 200) })
    const historyBeforeFailure = result.current.history
    let rejected: ReturnType<typeof result.current.drop>
    act(() => { rejected = result.current.drop('cargo-a', 1200, 200) })

    expect(rejected!).toMatchObject({
      ok: false,
      operation: 'drop',
      reason: 'quantity-limit',
      cargoId: 'cargo-a',
    })
    expect(result.current.history).toBe(historyBeforeFailure)
    expect(createId).toHaveBeenCalledTimes(2)
  })

  it('rejects an overlapping move without adding an undo entry', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo()],
      container,
      automaticDisplayResult: automaticResult(),
    }))
    const draft = addBox(addBox(emptyDraft(), manualBox('left')), manualBox('right', 'cargo-a', 400))
    act(() => { result.current.commit(draft) })
    const historyBeforeMove = result.current.history

    let moved: ReturnType<typeof result.current.move>
    act(() => { moved = result.current.move('left', 400, 0) })

    expect(moved!).toMatchObject({ ok: false, operation: 'move', reason: 'validation-failed' })
    expect(moved!.issues.some((issue) => issue.type === 'overlap')).toBe(true)
    expect(result.current.history).toBe(historyBeforeMove)
    expect(result.current.draft.boxes.find((box) => box.id === 'left')?.x).toBe(0)
  })

  it('treats a move to the current coordinates as a no-op without consuming undo history', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ quantity: 1 })],
      container,
      automaticDisplayResult: automaticResult(),
    }))
    act(() => { result.current.commit({ boxes: [manualBox('box-1')] }) })
    const historyBeforeMove = result.current.history

    let command: ReturnType<typeof result.current.move>
    act(() => { command = result.current.move('box-1', 0, 0, 0) })

    expect(command!).toMatchObject({ ok: true, operation: 'move', changed: false })
    expect(result.current.history).toBe(historyBeforeMove)
  })

  it('uses quick placement with the injected id source and returns a structured success', () => {
    const createId = vi.fn(() => 'quick-box')
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ quantity: 1 })],
      container,
      automaticDisplayResult: automaticResult(),
      createId,
    }))

    let command: ReturnType<typeof result.current.quickPlace>
    act(() => { command = result.current.quickPlace('cargo-a') })

    expect(command!).toMatchObject({ ok: true, operation: 'quick-place', boxId: 'quick-box' })
    expect(result.current.draft.boxes[0]).toMatchObject({ id: 'quick-box', x: 0, y: 0, z: 0 })
    expect(result.current.selectedId).toBe('quick-box')
  })

  it('commits a valid rotation and reports the rotated box', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ length: 400, width: 300, height: 200 })],
      container,
      automaticDisplayResult: automaticResult(),
    }))
    const rotatable = makeManualBox({
      id: 'rotatable',
      cargoId: 'cargo-a',
      label: 'P',
      color: '#f59e0b',
      length: 400,
      width: 300,
      height: 200,
      x: 500,
      y: 300,
    })
    act(() => { result.current.commit({ boxes: [rotatable] }) })

    let command: ReturnType<typeof result.current.rotate>
    act(() => { command = result.current.rotate('rotatable', 'right') })

    expect(command!).toMatchObject({
      ok: true,
      operation: 'rotate',
      rotatedBox: expect.objectContaining({ id: 'rotatable', length: 300, width: 400 }),
    })
    expect(result.current.draft.boxes[0]).toMatchObject({
      orientationKey: 'WLH',
      length: 300,
      width: 400,
    })
    expect(result.current.history.past).toHaveLength(2)
  })

  it('rejects rotation-disabled cargo without changing history and exposes the candidate geometry', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ length: 400, width: 300, height: 200, canRotate: false })],
      container,
      automaticDisplayResult: automaticResult(),
    }))
    const fixed = makeManualBox({
      id: 'fixed',
      cargoId: 'cargo-a',
      label: 'P',
      color: '#f59e0b',
      length: 400,
      width: 300,
      height: 200,
      canRotate: false,
      x: 500,
      y: 300,
    })
    act(() => { result.current.commit({ boxes: [fixed] }) })
    const historyBeforeRotation = result.current.history

    let command: ReturnType<typeof result.current.rotate>
    act(() => { command = result.current.rotate('fixed', 'right') })

    expect(command!).toMatchObject({
      ok: false,
      operation: 'rotate',
      reason: 'validation-failed',
      rotatedBox: expect.objectContaining({ id: 'fixed', length: 300, width: 400 }),
      issues: [expect.objectContaining({ type: 'rotation-disabled', boxId: 'fixed' })],
    })
    expect(result.current.history).toBe(historyBeforeRotation)
    expect(result.current.draft.boxes[0].orientationKey).toBe('LWH')
  })

  it('rejects an out-of-bounds rotation without changing history and returns exact candidate dimensions', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ length: 700, width: 300, height: 200 })],
      container,
      automaticDisplayResult: automaticResult(),
    }))
    const corner = makeManualBox({
      id: 'corner',
      cargoId: 'cargo-a',
      label: 'P',
      color: '#f59e0b',
      length: 700,
      width: 300,
      height: 200,
      x: 0,
      y: 0,
    })
    act(() => { result.current.commit({ boxes: [corner] }) })
    const historyBeforeRotation = result.current.history

    let command: ReturnType<typeof result.current.rotate>
    act(() => { command = result.current.rotate('corner', 'right') })

    expect(command!).toMatchObject({
      ok: false,
      operation: 'rotate',
      reason: 'validation-failed',
      rotatedBox: expect.objectContaining({
        id: 'corner',
        length: 300,
        width: 700,
        y: -200,
      }),
    })
    expect(command!.issues.some((issue) => issue.type === 'boundary')).toBe(true)
    expect(result.current.history).toBe(historyBeforeRotation)
  })

  it('re-derives the manual result when undo and redo change the active draft', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ quantity: 1 })],
      container,
      automaticDisplayResult: automaticResult(),
    }))
    act(() => { result.current.commit({ boxes: [manualBox('box-1')] }) })
    expect(result.current.manualResult).toMatchObject({ placedCount: 1, totalCargoCount: 1 })

    let undoResult: ReturnType<typeof result.current.undo>
    act(() => { undoResult = result.current.undo() })
    expect(undoResult!).toMatchObject({ ok: true, operation: 'undo' })
    expect(result.current.manualResult).toMatchObject({
      placedCount: 0,
      totalCargoCount: 1,
      unplaced: [expect.objectContaining({ cargoId: 'cargo-a', quantity: 1 })],
    })

    let redoResult: ReturnType<typeof result.current.redo>
    act(() => { redoResult = result.current.redo() })
    expect(redoResult!).toMatchObject({ ok: true, operation: 'redo' })
    expect(result.current.manualResult).toMatchObject({ placedCount: 1, totalCargoCount: 1 })
  })

  it('lets delete create a visible intermediate invalid state when a support box is removed', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo()],
      container,
      automaticDisplayResult: automaticResult(),
    }))
    const stacked = addBox(addBox(emptyDraft(), manualBox('bottom')), manualBox('top', 'cargo-a', 0, 400))
    act(() => {
      result.current.commit(stacked)
      result.current.select('top')
    })

    let command: ReturnType<typeof result.current.deleteBox>
    act(() => { command = result.current.deleteBox('bottom') })

    expect(command!).toMatchObject({ ok: true, operation: 'delete', boxId: 'bottom' })
    expect(result.current.draft.boxes.map((box) => box.id)).toEqual(['top'])
    expect(result.current.selectedId).toBeNull()
    expect(result.current.issues.some((issue) => issue.boxId === 'top' && issue.type === 'floating')).toBe(true)
    expect(result.current.blockingInvalidBoxIds.has('top')).toBe(true)
  })

  it('keeps warnings out of the blocking invalid id set', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo()],
      container,
      automaticDisplayResult: automaticResult(),
      supportPolicy: {
        allowPartialOverhang: true,
        minSupportRatio: 0.25,
        warningSupportRatio: 0.75,
        supportMode: 'field-review',
      },
    }))
    const bottom = manualBox('bottom')
    const overhanging = { ...manualBox('top', 'cargo-a', 200, 400), y: 0 }

    act(() => { result.current.commit({ boxes: [bottom, overhanging] }) })

    expect(result.current.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ boxId: 'top', type: 'floating', severity: 'warning' }),
    ]))
    expect(result.current.blockingInvalidBoxIds.has('top')).toBe(false)
  })

  it('continues from automatic placement while canonicalizing newly forbidden rotation', () => {
    const sourceBox = placedBox({
      canRotate: true,
      stackable: true,
      maxStackLayers: 8,
      groundOnly: false,
    })
    const rules = cargo({
      length: 300,
      width: 500,
      height: 700,
      canRotate: false,
      stackable: false,
      maxStackLayers: 2,
      groundOnly: true,
    })
    const createId = vi.fn(() => 'continued-box')
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [rules],
      container,
      automaticDisplayResult: automaticResult([sourceBox]),
      createId,
    }))

    let command: ReturnType<typeof result.current.continueFromAutomatic>
    act(() => { command = result.current.continueFromAutomatic() })

    expect(command!).toMatchObject({ ok: true, operation: 'continue-from-automatic' })
    expect(result.current.mode).toBe('manual')
    expect(result.current.selectedId).toBeNull()
    expect(result.current.history.past).toHaveLength(1)
    expect(result.current.draft.boxes).toEqual([
      expect.objectContaining({
        id: 'continued-box',
        x: 125,
        y: 250,
        z: 375,
        baseLength: 300,
        baseWidth: 500,
        baseHeight: 700,
        length: 300,
        width: 500,
        height: 700,
        orientationKey: 'LWH',
        labelRotationDeg: 0,
        yawQuarterTurn: 0,
        pitchQuarterTurn: 0,
        orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
        orientationLabel: 'X:L+ Y:W+ Z:T+',
        canRotate: false,
        stackable: false,
        maxStackLayers: 2,
        groundOnly: true,
      }),
    ])
    expect(renderedFootprint(result.current.draft.boxes[0])).toEqual({
      xExtent: 300,
      yExtent: 500,
      zExtent: 700,
    })
    expect(result.current.activeResult.placed[0]).toMatchObject({
      orientationKey: 'LWH',
      labelRotationDeg: 0,
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
    })
  })

  it('rotates a continued automatic box around its recovered body dimensions', () => {
    const sourceBox = placedBox({ z: 0 })
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ length: 300, width: 700, height: 500 })],
      container,
      automaticDisplayResult: automaticResult([sourceBox]),
      createId: () => 'continued-box',
    }))

    act(() => { result.current.continueFromAutomatic() })
    let command: ReturnType<typeof result.current.rotate>
    act(() => { command = result.current.rotate('continued-box', 'right') })

    expect(command!).toMatchObject({ ok: true, operation: 'rotate' })
    expect(result.current.draft.boxes[0]).toMatchObject({
      baseLength: 300,
      baseWidth: 700,
      baseHeight: 500,
      length: 500,
      width: 700,
      height: 300,
      orientationKey: 'HWL',
      labelRotationDeg: 180,
      yawQuarterTurn: 2,
      pitchQuarterTurn: 1,
      orientationAxes: { x: 'H-', y: 'W-', z: 'L-' },
      orientationLabel: 'X:T- Y:W- Z:L-',
    })
    expect(renderedFootprint(result.current.draft.boxes[0])).toEqual({
      xExtent: 500,
      yExtent: 700,
      zExtent: 300,
    })
  })

  it('clips an automatic continuation to the current cargo plan in the same transition', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ quantity: 1 })],
      container,
      automaticDisplayResult: automaticResult([
        placedBox({ id: 'auto-a-1', z: 0 }),
        placedBox({ id: 'auto-a-2', x: 900, z: 0 }),
        placedBox({ id: 'orphan', cargoId: 'deleted-cargo', x: 1300, z: 0 }),
      ]),
      createId: (sourceId) => `continued-${sourceId}`,
    }))

    act(() => { result.current.continueFromAutomatic() })

    expect(result.current.draft.boxes.map((box) => box.id)).toEqual(['continued-auto-a-1'])
    expect(result.current.manualResult).toMatchObject({ placedCount: 1, totalCargoCount: 1 })
  })

  it('reconciles every history branch to cargo deletion and quantity reductions', () => {
    const cargoB = cargo({ id: 'cargo-b', name: 'Control valve', label: 'V', quantity: 1 })
    const { result, rerender } = renderHook(
      ({ cargoItems }: { cargoItems: CargoItem[] }) => useManualPlacementSession({
        cargoItems,
        container,
        automaticDisplayResult: automaticResult(),
      }),
      { initialProps: { cargoItems: [cargo(), cargoB] } },
    )
    const firstDraft = {
      boxes: [manualBox('pump-1'), manualBox('valve-1', 'cargo-b', 400)],
    }
    const secondDraft = {
      boxes: [...firstDraft.boxes, manualBox('pump-2', 'cargo-a', 800)],
    }

    act(() => {
      result.current.commit(firstDraft)
      result.current.commit(secondDraft)
    })
    act(() => {
      result.current.undo()
      result.current.select('valve-1')
    })

    rerender({ cargoItems: [cargo({ quantity: 1 })] })

    expect(result.current.draft.boxes.map((box) => box.id)).toEqual(['pump-1'])
    expect(result.current.selectedId).toBeNull()
    expect(result.current.manualResult).toMatchObject({ placedCount: 1, totalCargoCount: 1 })
    expect(result.current.history.past.flatMap((draft) => draft.boxes).every((box) => box.cargoId === 'cargo-a')).toBe(true)
    expect(result.current.history.future.flatMap((draft) => draft.boxes).map((box) => box.id)).toEqual(['pump-1'])

    act(() => { result.current.redo() })
    expect(result.current.draft.boxes.map((box) => box.id)).toEqual(['pump-1'])
    expect(result.current.manualResult).toMatchObject({ placedCount: 1, totalCargoCount: 1 })

    rerender({ cargoItems: [cargo({ quantity: 3 })] })
    expect(result.current.draft.boxes.map((box) => box.id)).toEqual(['pump-1'])
    expect(result.current.manualResult).toMatchObject({ placedCount: 1, totalCargoCount: 3 })
  })

  it('restores cargo A atomically while current cargo B and global defaults are still active', () => {
    const snapshotCargo = [cargo({ id: 'cargo-a', quantity: 2 })]
    const currentCargo = [cargo({ id: 'cargo-b', name: 'Control valve', label: 'V', quantity: 1 })]
    const restoredDraft = {
      boxes: [
        {
          ...manualBox('snapshot-a-1', 'cargo-a', 25),
          length: 400,
          width: 400,
          height: 400,
          orientationKey: 'WLH' as const,
          labelRotationDeg: 90 as const,
          yawQuarterTurn: 1 as const,
          pitchQuarterTurn: 2 as const,
          orientationAxes: { x: 'W+', y: 'L-', z: 'H+' } as const,
          orientationLabel: 'X:W+ Y:L- Z:T+',
        },
        {
          ...manualBox('snapshot-a-2', 'cargo-a', 425),
          length: 400,
          width: 400,
          height: 400,
          orientationKey: 'WLH' as const,
          labelRotationDeg: 90 as const,
          yawQuarterTurn: 1 as const,
          pitchQuarterTurn: 2 as const,
          orientationAxes: { x: 'W+', y: 'L-', z: 'H+' } as const,
          orientationLabel: 'X:W+ Y:L- Z:T+',
        },
      ],
    }
    const projectPose = (box: Pick<ManualPlacedBox | PlacedBox, 'id' | 'cargoId' | 'x' | 'y' | 'z' | 'length' | 'width' | 'height' | 'orientationKey' | 'labelRotationDeg' | 'yawQuarterTurn' | 'pitchQuarterTurn' | 'orientationAxes' | 'orientationLabel' | 'maxStackLayers'>) => ({
      id: box.id,
      cargoId: box.cargoId,
      x: box.x,
      y: box.y,
      z: box.z,
      length: box.length,
      width: box.width,
      height: box.height,
      orientationKey: box.orientationKey,
      labelRotationDeg: box.labelRotationDeg,
      yawQuarterTurn: box.yawQuarterTurn,
      pitchQuarterTurn: box.pitchQuarterTurn,
      orientationAxes: box.orientationAxes,
      orientationLabel: box.orientationLabel,
      maxStackLayers: box.maxStackLayers,
    })
    const { result, rerender } = renderHook(
      ({ cargoItems, defaultMaxStackLayers }: { cargoItems: CargoItem[]; defaultMaxStackLayers?: number }) => useManualPlacementSession({
        cargoItems,
        container,
        defaultMaxStackLayers,
        automaticDisplayResult: automaticResult(),
      }),
      { initialProps: { cargoItems: currentCargo, defaultMaxStackLayers: 5 } },
    )

    act(() => {
      result.current.restoreHistoryDraft({
        draft: restoredDraft,
        mode: 'manual',
        draftInitialized: true,
        cargoItems: snapshotCargo,
        defaultMaxStackLayers: undefined,
      })
    })
    rerender({ cargoItems: snapshotCargo, defaultMaxStackLayers: undefined })

    expect(result.current.draft.boxes).toHaveLength(2)
    expect(result.current.draft.boxes.map(projectPose)).toEqual(restoredDraft.boxes.map(projectPose))
    expect(result.current.manualResult.placed).toHaveLength(2)
    expect(result.current.manualResult.placed.map(projectPose)).toEqual(restoredDraft.boxes.map(projectPose))
    expect(result.current.draft.boxes.every((box) => box.maxStackLayers === undefined)).toBe(true)
  })

  it('owns restored orientation axes independently from the snapshot caller', () => {
    const restoredDraft: ManualDraft = {
      boxes: [{
        ...manualBox('snapshot-a-1'),
        orientationAxes: { x: 'W+' as const, y: 'L-' as const, z: 'H+' as const },
      }],
    }
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ quantity: 1 })],
      container,
      automaticDisplayResult: automaticResult(),
    }))

    act(() => {
      result.current.restoreHistoryDraft({
        draft: restoredDraft,
        mode: 'manual',
        draftInitialized: true,
        cargoItems: [cargo({ quantity: 1 })],
      })
    })
    restoredDraft.boxes[0].orientationAxes.x = 'L+'

    expect(result.current.draft.boxes[0].orientationAxes).toEqual({ x: 'W+', y: 'L-', z: 'H+' })
  })

  it.each([
    { name: 'cargo limit', cargoLimit: 2, globalLimit: 1, expected: 2 },
    { name: 'global fallback', cargoLimit: undefined, globalLimit: 1, expected: 1 },
    { name: 'unlimited fallback', cargoLimit: undefined, globalLimit: undefined, expected: undefined },
  ])('freezes the effective max stack layers for $name', ({ cargoLimit, globalLimit, expected }) => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ maxStackLayers: cargoLimit })],
      container,
      automaticDisplayResult: automaticResult(),
      defaultMaxStackLayers: globalLimit,
    }))

    act(() => {
      result.current.commit({
        boxes: [manualBox('bottom'), manualBox('top', 'cargo-a', 0, 400)],
      })
    })

    expect(result.current.draft.boxes.map((box) => box.maxStackLayers)).toEqual([expected, expected])
    expect(result.current.issues.some((issue) => issue.type === 'max-stack-layers')).toBe(expected === 1)
  })

  it('uses the global stack limit while seeding and while validating a drop', () => {
    const source = placedBox({
      x: 0,
      y: 0,
      z: 0,
      length: 400,
      width: 400,
      height: 400,
      orientationKey: 'LWH',
      labelRotationDeg: 0,
      yawQuarterTurn: 0,
      pitchQuarterTurn: 0,
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
      orientationLabel: 'X:L+ Y:W+ Z:T+',
      maxStackLayers: 8,
    })
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo({ maxStackLayers: undefined })],
      container,
      automaticDisplayResult: automaticResult([source]),
      defaultMaxStackLayers: 1,
      createId: (sourceId) => sourceId ? `manual-${sourceId}` : 'dropped',
    }))

    act(() => { result.current.continueFromAutomatic() })
    expect(result.current.draft.boxes[0].maxStackLayers).toBe(1)

    let command: ManualPlacementCommandResult
    act(() => { command = result.current.drop('cargo-a', 0, 0, 400) })
    expect(command!).toMatchObject({
      ok: false,
      reason: 'validation-failed',
      issues: [expect.objectContaining({ type: 'max-stack-layers' })],
    })
  })
  it('reconciles every retained history frame when the global stack limit changes', () => {
    const { result, rerender } = renderHook(
      ({ defaultMaxStackLayers }: { defaultMaxStackLayers?: number }) => useManualPlacementSession({
        cargoItems: [cargo({ maxStackLayers: undefined })],
        container,
        automaticDisplayResult: automaticResult(),
        defaultMaxStackLayers,
      }),
      { initialProps: { defaultMaxStackLayers: 5 } },
    )

    act(() => { result.current.commit({ boxes: [manualBox('frame-1')] }) })
    act(() => { result.current.commit({ boxes: [manualBox('frame-2', 'cargo-a', 400)] }) })
    act(() => { result.current.commit({ boxes: [manualBox('frame-3', 'cargo-a', 800)] }) })
    act(() => { result.current.commit({ boxes: [manualBox('frame-4', 'cargo-a', 1200)] }) })
    act(() => { result.current.undo() })
    act(() => { result.current.undo() })

    expect(result.current.history.past).not.toHaveLength(0)
    expect(result.current.history.present.boxes).not.toHaveLength(0)
    expect(result.current.history.future).not.toHaveLength(0)
    expect(result.current.history.past.flatMap((draft) => draft.boxes).every((box) => box.maxStackLayers === 5)).toBe(true)
    expect(result.current.history.present.boxes.every((box) => box.maxStackLayers === 5)).toBe(true)
    expect(result.current.history.future.flatMap((draft) => draft.boxes).every((box) => box.maxStackLayers === 5)).toBe(true)

    rerender({ defaultMaxStackLayers: 1 })

    expect(result.current.history.past.flatMap((draft) => draft.boxes).every((box) => box.maxStackLayers === 1)).toBe(true)
    expect(result.current.history.present.boxes.every((box) => box.maxStackLayers === 1)).toBe(true)
    expect(result.current.history.future.flatMap((draft) => draft.boxes).every((box) => box.maxStackLayers === 1)).toBe(true)
  })
})

// P2-2 RED tests — setMode('manual') should copy auto result when draft is empty
describe('setMode auto-copies automatic result on first entry', () => {
  it('copies automatic placed boxes into draft when switching to manual with an empty draft', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo()],
      container,
      automaticDisplayResult: automaticResult([placedBox({ id: 'auto-1', z: 0 })]),
      createId: (sourceId) => `m-${sourceId}`,
    }))

    // Initially auto mode, empty draft
    expect(result.current.mode).toBe('auto')
    expect(result.current.draft.boxes).toHaveLength(0)

    act(() => { result.current.setMode('manual') })

    // After switching, draft should contain the automatic result's boxes
    expect(result.current.mode).toBe('manual')
    expect(result.current.draft.boxes).toHaveLength(1)
    expect(result.current.draft.boxes[0].id).toBe('m-auto-1')
  })

  it('does NOT overwrite an existing draft when switching back to manual', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo()],
      container,
      automaticDisplayResult: automaticResult([placedBox({ id: 'auto-1', z: 0 })]),
      createId: (sourceId) => `m-${sourceId}`,
    }))

    // Switch to manual, add a box manually
    act(() => { result.current.setMode('manual') })
    act(() => { result.current.setMode('auto') })
    // Manually commit a draft
    const manualDraft = { boxes: [manualBox('my-box')] }
    act(() => {
      result.current.setMode('manual')
      result.current.commit(manualDraft)
    })
    // Switch to auto and back — should not overwrite the existing manual draft
    act(() => { result.current.setMode('auto') })
    act(() => { result.current.setMode('manual') })

    // existing draft is preserved
    expect(result.current.draft.boxes.map(b => b.id)).toContain('my-box')
  })

  it('keeps an intentionally emptied draft empty when re-entering manual mode', () => {
    const { result } = renderHook(() => useManualPlacementSession({
      cargoItems: [cargo()],
      container,
      automaticDisplayResult: automaticResult([placedBox({ id: 'auto-1', z: 0 })]),
      createId: (sourceId) => `m-${sourceId}`,
    }))

    act(() => { result.current.setMode('manual') })
    expect(result.current.draft.boxes).toHaveLength(1)

    act(() => { result.current.undo() })
    expect(result.current.draft.boxes).toHaveLength(0)
    expect(result.current.state.draftInitialized).toBe(true)

    act(() => { result.current.setMode('auto') })
    act(() => { result.current.setMode('manual') })
    expect(result.current.draft.boxes).toHaveLength(0)
  })
})
