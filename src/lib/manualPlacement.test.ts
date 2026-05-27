import { describe, expect, it } from 'vitest'
import type { CargoItem, ContainerSpec } from '../types'
import {
  addBox,
  buildPool,
  commit,
  cycleBoxOrientation,
  dimensionsForManualOrientation,
  dryRunRotation,
  dryRunOrientation,
  emptyDraft,
  emptyHistory,
  labelRotationForManualOrientation,
  makeManualBox,
  moveBox,
  redo,
  removeBox,
  rotateBox,
  rotateBoxDown90,
  rotateBoxRight90,
  setManualBoxOrientation,
  setBoxPosition,
  toPlacedBoxes,
  undo,
  validateDraft,
} from './manualPlacement'

function container(overrides: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: 'test',
    label: 'Test container',
    description: '',
    length: 5000,
    width: 2000,
    height: 2000,
    maxWeight: 20000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
    ...overrides,
  }
}

function cargo(overrides: Partial<CargoItem> = {}): CargoItem {
  return {
    id: 'cargo-a',
    name: 'Carton A',
    label: 'A',
    length: 400,
    width: 500,
    height: 600,
    weight: 10,
    quantity: 4,
    color: '#f59e0b',
    canRotate: true,
    stackable: true,
    ...overrides,
  }
}

describe('manualPlacement', () => {
  it('addBox returns a new draft without mutating the original', () => {
    const original = emptyDraft()
    const box = makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 0,
      y: 0,
    })

    const next = addBox(original, box)

    expect(next).not.toBe(original)
    expect(original.boxes).toHaveLength(0)
    expect(next.boxes).toHaveLength(1)
    expect(next.boxes[0]).toMatchObject({ id: 'box-1', x: 0, y: 0 })
  })

  it('moveBox updates the position by delta and keeps the original draft intact', () => {
    const box = makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 100,
      y: 200,
    })
    const draft = addBox(emptyDraft(), box)

    const moved = moveBox(draft, 'box-1', 50, -25)

    expect(draft.boxes[0]).toMatchObject({ x: 100, y: 200 })
    expect(moved.boxes[0]).toMatchObject({ x: 150, y: 175 })
  })

  it('setBoxPosition sets absolute coordinates for the specified box', () => {
    const box = makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 100,
      y: 200,
    })
    const draft = addBox(emptyDraft(), box)

    const moved = setBoxPosition(draft, 'box-1', 800, 900)

    expect(moved.boxes[0]).toMatchObject({ x: 800, y: 900 })
  })

  it('setBoxPosition keeps z unchanged when third argument is omitted, updates when provided', () => {
    const box = makeManualBox({
      id: 'box-z',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 100,
      y: 200,
    })
    const draft = addBox(emptyDraft(), box)

    const xy = setBoxPosition(draft, 'box-z', 500, 600)
    expect(xy.boxes[0]).toMatchObject({ x: 500, y: 600, z: 0 })

    const stacked = setBoxPosition(xy, 'box-z', 500, 600, 600)
    expect(stacked.boxes[0]).toMatchObject({ x: 500, y: 600, z: 600 })
  })

  it('removeBox removes the matching id and keeps other boxes', () => {
    const draft = addBox(
      addBox(emptyDraft(), makeManualBox({
        id: 'box-1',
        cargoId: 'cargo-a',
        label: 'A',
        color: '#fff',
        length: 400,
        width: 500,
        height: 600,
        x: 0,
        y: 0,
      })),
      makeManualBox({
        id: 'box-2',
        cargoId: 'cargo-a',
        label: 'A',
        color: '#fff',
        length: 400,
        width: 500,
        height: 600,
        x: 600,
        y: 0,
      }),
    )

    const result = removeBox(draft, 'box-1')

    expect(result.boxes).toHaveLength(1)
    expect(result.boxes[0].id).toBe('box-2')
  })

  it('rotateBox swaps length and width for a horizontal 90 degree rotation', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 0,
      y: 0,
    }))

    const rotated = rotateBox(draft, 'box-1')

    expect(rotated.boxes[0]).toMatchObject({
      length: 500,
      width: 400,
      orientationKey: 'WLH',
      labelRotationDeg: 90,
    })
  })

  it('maps R to right 90 degrees and Shift+R to down 90 degrees for every orientation', () => {
    const baseDraft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 0,
      y: 0,
    }))
    const right90 = {
      LWH: 'WLH',
      WLH: 'LWH',
      LHW: 'HLW',
      HLW: 'LHW',
      WHL: 'HWL',
      HWL: 'WHL',
    } as const
    const down90 = {
      LWH: 'LHW',
      LHW: 'LWH',
      WLH: 'WHL',
      WHL: 'WLH',
      HLW: 'HWL',
      HWL: 'HLW',
    } as const

    Object.keys(right90).forEach((orientationKey) => {
      const oriented = setManualBoxOrientation(baseDraft, 'box-1', orientationKey as keyof typeof right90)
      expect(rotateBoxRight90(oriented, 'box-1').boxes[0].orientationKey).toBe(right90[orientationKey as keyof typeof right90])
      expect(rotateBoxDown90(oriented, 'box-1').boxes[0].orientationKey).toBe(down90[orientationKey as keyof typeof down90])
    })
  })

  it('dryRunRotation validates the requested spatial rotation direction', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 0,
      y: 0,
    }))

    expect(dryRunRotation(draft, 'box-1', container(), 'right').rotatedBox?.orientationKey).toBe('WLH')
    expect(dryRunRotation(draft, 'box-1', container(), 'down').rotatedBox?.orientationKey).toBe('LHW')
  })

  it('setManualBoxOrientation maps all six orientations from the original dimensions', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 0,
      y: 0,
    }))

    const expected = {
      LWH: { length: 400, width: 500, height: 600, labelRotationDeg: 0 },
      WLH: { length: 500, width: 400, height: 600, labelRotationDeg: 90 },
      LHW: { length: 400, width: 600, height: 500, labelRotationDeg: 90 },
      HLW: { length: 600, width: 400, height: 500, labelRotationDeg: 180 },
      WHL: { length: 500, width: 600, height: 400, labelRotationDeg: 270 },
      HWL: { length: 600, width: 500, height: 400, labelRotationDeg: 180 },
    } as const

    Object.entries(expected).forEach(([orientationKey, dimensions]) => {
      const next = setManualBoxOrientation(draft, 'box-1', orientationKey as keyof typeof expected)
      expect(next.boxes[0]).toMatchObject({
        ...dimensions,
        orientationKey,
        baseLength: 400,
        baseWidth: 500,
        baseHeight: 600,
      })
    })
  })

  it('cycleBoxOrientation advances through all six canonical orientations', () => {
    let draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 0,
      y: 0,
    }))

    const seen = []
    for (let i = 0; i < 6; i += 1) {
      draft = cycleBoxOrientation(draft, 'box-1')
      seen.push(draft.boxes[0].orientationKey)
    }

    expect(seen).toEqual(['WLH', 'LHW', 'HLW', 'WHL', 'HWL', 'LWH'])
  })

  it('dryRunOrientation rejects changes for non-rotatable cargo', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      canRotate: false,
      x: 0,
      y: 0,
    }))

    const result = dryRunOrientation(draft, 'box-1', 'WLH', container())

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({ type: 'rotation-disabled', boxId: 'box-1' }),
    ])
  })

  it('exports orientation helpers for UI labels and tests', () => {
    expect(dimensionsForManualOrientation({ length: 400, width: 500, height: 600 }, 'HWL')).toEqual({ length: 600, width: 500, height: 400 })
    expect(labelRotationForManualOrientation('WHL')).toBe(270)
  })

  it('buildPool reports remaining cargo per type after subtracting placed boxes', () => {
    const items = [
      cargo({ id: 'cargo-a', quantity: 4 }),
      cargo({ id: 'cargo-b', label: 'B', quantity: 2 }),
    ]

    let draft = emptyDraft()
    draft = addBox(draft, makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    }))
    draft = addBox(draft, makeManualBox({
      id: 'b2', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 600, y: 0,
    }))

    const pool = buildPool(items, draft)

    expect(pool).toHaveLength(2)
    expect(pool[0]).toMatchObject({ cargoId: 'cargo-a', remaining: 2 })
    expect(pool[1]).toMatchObject({ cargoId: 'cargo-b', remaining: 2 })
  })

  it('validateDraft flags boundary violations when a box exceeds container bounds', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 4800, y: 0,
    }))

    const issues = validateDraft(draft, container({ length: 5000, width: 2000, height: 2000 }))

    expect(issues).toEqual([
      expect.objectContaining({ type: 'boundary', boxId: 'b1' }),
    ])
  })

  it('validateDraft flags overlap when two boxes overlap on the xy plane', () => {
    let draft = emptyDraft()
    draft = addBox(draft, makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    }))
    draft = addBox(draft, makeManualBox({
      id: 'b2', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 200, y: 200,
    }))

    const issues = validateDraft(draft, container())

    const overlapIssues = issues.filter((issue) => issue.type === 'overlap')
    expect(overlapIssues).toHaveLength(2)
    expect(overlapIssues.map((issue) => issue.boxId).sort()).toEqual(['b1', 'b2'])
  })

  it('validateDraft allows xy overlap when boxes are stacked with enough support', () => {
    let draft = emptyDraft()
    draft = addBox(draft, makeManualBox({
      id: 'base', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    }))
    draft = setBoxPosition(addBox(draft, makeManualBox({
      id: 'top', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    })), 'top', 0, 0, 600)

    const issues = validateDraft(draft, container())

    expect(issues).toHaveLength(0)
  })

  it('validateDraft flags boxes that float without at least half base support', () => {
    let draft = emptyDraft()
    draft = addBox(draft, makeManualBox({
      id: 'base', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    }))
    draft = setBoxPosition(addBox(draft, makeManualBox({
      id: 'top', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 250, y: 0,
    })), 'top', 250, 0, 600)

    const issues = validateDraft(draft, container())

    expect(issues).toEqual([
      expect.objectContaining({ type: 'floating', boxId: 'top' }),
    ])
  })

  it('validateDraft flags boxes stacked on non-stackable cargo', () => {
    let draft = emptyDraft()
    draft = addBox(draft, makeManualBox({
      id: 'base', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0, stackable: false,
    }))
    draft = setBoxPosition(addBox(draft, makeManualBox({
      id: 'top', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    })), 'top', 0, 0, 600)

    const issues = validateDraft(draft, container())

    expect(issues).toEqual([
      expect.objectContaining({ type: 'stacking', boxId: 'top' }),
    ])
  })

  it('validateDraft returns no issues for non-overlapping in-bounds boxes', () => {
    let draft = emptyDraft()
    draft = addBox(draft, makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    }))
    draft = addBox(draft, makeManualBox({
      id: 'b2', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 500, y: 0,
    }))

    const issues = validateDraft(draft, container())

    expect(issues).toHaveLength(0)
  })

  it('undo and redo round-trip the present state through history', () => {
    const history0 = emptyHistory()
    const draftA = addBox(history0.present, makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    }))
    const history1 = commit(history0, draftA)
    const draftB = addBox(history1.present, makeManualBox({
      id: 'b2', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 600, y: 0,
    }))
    const history2 = commit(history1, draftB)

    expect(history2.present.boxes).toHaveLength(2)

    const afterUndo = undo(history2)
    expect(afterUndo.present.boxes).toHaveLength(1)
    expect(afterUndo.future).toHaveLength(1)

    const afterRedo = redo(afterUndo)
    expect(afterRedo.present.boxes).toHaveLength(2)
    expect(afterRedo.future).toHaveLength(0)
  })

  it('commit clears the redo stack when a new branch is taken', () => {
    const history0 = emptyHistory()
    const history1 = commit(history0, addBox(history0.present, makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    })))
    const afterUndo = undo(history1)
    expect(afterUndo.future).toHaveLength(1)

    const newBranch = commit(afterUndo, addBox(afterUndo.present, makeManualBox({
      id: 'b2', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    })))

    expect(newBranch.future).toHaveLength(0)
    expect(newBranch.present.boxes[0].id).toBe('b2')
  })

  it('toPlacedBoxes converts every manual box and preserves orientation metadata', () => {
    let draft = emptyDraft()
    draft = addBox(draft, makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#f59e0b',
      length: 400, width: 500, height: 600, x: 100, y: 200,
    }))
    draft = rotateBox(draft, 'b1')
    draft = addBox(draft, makeManualBox({
      id: 'b2', cargoId: 'cargo-b', label: 'B', color: '#0ea5e9',
      length: 300, width: 300, height: 300, x: 800, y: 0,
    }))

    const placed = toPlacedBoxes(draft, new Set(['b1']))

    expect(placed).toHaveLength(2)
    expect(placed[0]).toMatchObject({
      id: 'b1',
      cargoId: 'cargo-a',
      label: 'A',
      name: 'A',
      color: '#f59e0b',
      orientationKey: 'WLH',
      labelRotationDeg: 90,
      physicalLayer: 1,
      workStep: 1,
      supportType: 'floor',
      supportedBy: [],
      stackable: true,
      weight: 0,
      index: 1,
    })
    expect(placed[1]).toMatchObject({
      id: 'b2',
      orientationKey: 'LWH',
      labelRotationDeg: 0,
    })
  })

  it('toPlacedBoxes preserves manual weight and stackability', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#f59e0b',
      length: 400, width: 500, height: 600, weight: 24, stackable: false, x: 100, y: 200,
    }))

    const placed = toPlacedBoxes(draft, new Set())

    expect(placed[0]).toMatchObject({ weight: 24, stackable: false })
  })

  it('toPlacedBoxes returns an empty array for an empty draft without throwing', () => {
    expect(() => toPlacedBoxes(emptyDraft(), new Set())).not.toThrow()
    expect(toPlacedBoxes(emptyDraft(), new Set())).toEqual([])
  })
})

import { dryRunRotation as _dryRunRotation } from './manualPlacement'
import type { ContainerSpec as _CS } from '../types'

describe('dryRunRotation', () => {
  const container: _CS = { id: 't', label: 'T', description: '', length: 6000, width: 2300, height: 2600, maxWeight: 28000, doorGap: 0, topGap: 0, sideGap: 0 }

  it('returns ok when rotation keeps the box inside the container', () => {
    const box = { id: 'a', cargoId: 'c', label: 'A', x: 0, y: 0, z: 0, length: 1000, width: 800, height: 500, orientationKey: 'LWH' as const, labelRotationDeg: 0 as const, color: '#000' }
    const { ok, issues } = _dryRunRotation({ boxes: [box] }, 'a', container)
    expect(ok).toBe(true)
    expect(issues).toEqual([])
  })

  it('flags boundary issue when rotated width would exceed container width', () => {
    const box = { id: 'a', cargoId: 'c', label: 'A', x: 0, y: 0, z: 0, length: 5500, width: 2400, height: 500, orientationKey: 'LWH' as const, labelRotationDeg: 0 as const, color: '#000' }
    const { ok, issues } = _dryRunRotation({ boxes: [box] }, 'a', container)
    expect(ok).toBe(false)
    expect(issues.some((i) => i.type === 'boundary')).toBe(true)
  })

  it('returns ok=false but rotatedBox is null when id not found', () => {
    const { ok, rotatedBox } = _dryRunRotation({ boxes: [] }, 'ghost', container)
    expect(ok).toBe(false)
    expect(rotatedBox).toBeNull()
  })
})

import { makeManualBox as _makeManualBox } from './manualPlacement'

describe('makeManualBox z parameter', () => {
  it('defaults z to 0 when omitted', () => {
    const box = _makeManualBox({ id: 'a', cargoId: 'c', label: 'A', color: '#000', length: 100, width: 100, height: 100, x: 0, y: 0 })
    expect(box.z).toBe(0)
  })

  it('passes through an explicit z value', () => {
    const box = _makeManualBox({ id: 'a', cargoId: 'c', label: 'A', color: '#000', length: 100, width: 100, height: 100, x: 0, y: 0, z: 750 })
    expect(box.z).toBe(750)
  })
})
