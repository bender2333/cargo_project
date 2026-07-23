import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CargoItem, ContainerSpec, PackingResult, PlacedBox } from '../types'
import { addBox, emptyDraft, makeManualBox } from '../lib/manualPlacement'
import { renderedFootprint } from '../lib/renderedFootprint'
import { useManualPlacementSession } from './useManualPlacementSession'

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
    maxStackLayers: 8,
    physicalLayer: 1,
    verticalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    verticalSupportedBy: [],
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

  it('uses the automatic display result only in auto mode, including for an empty manual draft', () => {
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

    expect(result.current.activeResult).toBe(result.current.manualResult)
    expect(result.current.activeResult).not.toBe(automatic)
    expect(result.current.activeResult.placed).toEqual([])
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
      cargoItems: [cargo()],
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
      cargoItems: [cargo({ canRotate: false })],
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
      cargoItems: [cargo()],
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

  it('continues from automatic placement in one action while preserving displayed geometry and cargo rules', () => {
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
        baseWidth: 700,
        baseHeight: 500,
        length: 700,
        width: 500,
        height: 300,
        orientationKey: 'WHL',
        labelRotationDeg: 270,
        yawQuarterTurn: 1,
        pitchQuarterTurn: 1,
        orientationAxes: { x: 'W+', y: 'H-', z: 'L-' },
        orientationLabel: 'X:W+ Y:T- Z:L-',
        canRotate: false,
        stackable: false,
        maxStackLayers: 2,
        groundOnly: true,
      }),
    ])
    expect(renderedFootprint(result.current.draft.boxes[0])).toEqual({
      xExtent: 700,
      yExtent: 500,
      zExtent: 300,
    })
    expect(result.current.activeResult.placed[0]).toMatchObject({
      orientationKey: 'WHL',
      labelRotationDeg: 270,
      orientationAxes: { x: 'W+', y: 'H-', z: 'L-' },
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
})
