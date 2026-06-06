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
  isBlockingManualIssue,
  labelRotationForManualOrientation,
  makeManualBox,
  moveBox,
  redo,
  removeBox,
  rotateBox,
  rotateBoxDown90,
  rotateBoxLeft90,
  rotateBoxRight90,
  rotateBoxUp90,
  setManualBoxOrientation,
  setBoxPosition,
  toPlacedBoxes,
  undo,
  validateDraft,
} from './manualPlacement'
import type { SupportPolicy } from './placementSettings'

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

  it('rotateBox swaps length and width for a horizontal 90 degree rotation while keeping the label readable', () => {
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
      orientationAxes: { x: 'W+', y: 'L-', z: 'H+' },
      orientationLabel: 'X:W+ Y:L- Z:T+',
      labelRotationDeg: 270,
      yawQuarterTurn: 1,
      pitchQuarterTurn: 0,
    })
  })

  it('rotates around the box centre so R keeps the geometric centre fixed', () => {
    // Reproduces the debug-snapshot finding: a box at x=1600 y=1650 with L/W=400/500
    // had its centre jump between (1800,1900) and (1850,1850) on each R. Rotation must
    // pivot about the box centre, not its min corner.
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 1600,
      y: 1650,
      z: 300,
    }))
    const before = draft.boxes[0]
    const centre = (b: typeof before) => ({
      cx: b.x + b.length / 2,
      cy: b.y + b.width / 2,
      cz: b.z + b.height / 2,
    })

    const right = rotateBoxRight90(draft, 'box-1').boxes[0]
    // dimensions swap on R …
    expect(right).toMatchObject({ length: 500, width: 400, height: 600 })
    // … but the geometric centre is unchanged.
    expect(centre(right)).toEqual(centre(before))
    // concretely: 400×500 box centred at (1800,1900) becomes 500×400 → x=1550 y=1700.
    expect(right).toMatchObject({ x: 1550, y: 1700, z: 300 })

    const down = rotateBoxDown90(draft, 'box-1').boxes[0]
    // Shift+R changes height (600→500 here); the centre must still hold (pure geometric centre).
    expect(centre(down)).toEqual(centre(before))
  })

  it('cycles R through four horizontal quarter turns without changing top and bottom', () => {
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
    for (let i = 0; i < 4; i += 1) {
      draft = rotateBoxRight90(draft, 'box-1')
      const box = draft.boxes[0]
      seen.push({
        orientationKey: box.orientationKey,
        yawQuarterTurn: box.yawQuarterTurn,
        pitchQuarterTurn: box.pitchQuarterTurn,
        height: box.height,
        labelRotationDeg: box.labelRotationDeg,
        orientationLabel: box.orientationLabel,
        orientationAxes: box.orientationAxes,
      })
    }

    expect(seen).toEqual([
      expect.objectContaining({ orientationKey: 'WLH', yawQuarterTurn: 1, pitchQuarterTurn: 0, height: 600, labelRotationDeg: 270, orientationAxes: { x: 'W+', y: 'L-', z: 'H+' }, orientationLabel: 'X:W+ Y:L- Z:T+' }),
      expect.objectContaining({ orientationKey: 'LWH', yawQuarterTurn: 2, pitchQuarterTurn: 0, height: 600, labelRotationDeg: 180, orientationAxes: { x: 'L-', y: 'W-', z: 'H+' }, orientationLabel: 'X:L- Y:W- Z:T+' }),
      expect.objectContaining({ orientationKey: 'WLH', yawQuarterTurn: 3, pitchQuarterTurn: 0, height: 600, labelRotationDeg: 90, orientationAxes: { x: 'W-', y: 'L+', z: 'H+' }, orientationLabel: 'X:W- Y:L+ Z:T+' }),
      expect.objectContaining({ orientationKey: 'LWH', yawQuarterTurn: 0, pitchQuarterTurn: 0, height: 600, labelRotationDeg: 0, orientationAxes: { x: 'L+', y: 'W+', z: 'H+' }, orientationLabel: 'X:L+ Y:W+ Z:T+' }),
    ])
  })

  it('keeps the current vertical axis fixed when R is pressed after a downward rotation', () => {
    let draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'G',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 0,
      y: 0,
    }))

    draft = rotateBoxDown90(draft, 'box-1')
    const afterDown = draft.boxes[0]
    expect(afterDown).toMatchObject({ orientationKey: 'LHW', height: 500, orientationAxes: { x: 'L+', y: 'H+', z: 'W-' }, orientationLabel: 'X:L+ Y:T+ Z:W-' })

    draft = rotateBoxRight90(draft, 'box-1')
    expect(draft.boxes[0]).toMatchObject({
      orientationKey: 'HLW',
      height: 500,
      labelRotationDeg: 270,
      yawQuarterTurn: 1,
      pitchQuarterTurn: 1,
      orientationAxes: { x: 'H+', y: 'L-', z: 'W-' },
      orientationLabel: 'X:T+ Y:L- Z:W-',
    })

    draft = rotateBoxRight90(draft, 'box-1')
    expect(draft.boxes[0]).toMatchObject({
      orientationKey: 'LHW',
      height: 500,
      yawQuarterTurn: 2,
      pitchQuarterTurn: 1,
      orientationAxes: { x: 'L-', y: 'H-', z: 'W-' },
      orientationLabel: 'X:L- Y:T- Z:W-',
    })
  })

  it('cycles Shift+R through four downward quarter turns', () => {
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
    for (let i = 0; i < 4; i += 1) {
      draft = rotateBoxDown90(draft, 'box-1')
      const box = draft.boxes[0]
      seen.push({
        orientationKey: box.orientationKey,
        yawQuarterTurn: box.yawQuarterTurn,
        pitchQuarterTurn: box.pitchQuarterTurn,
        width: box.width,
        height: box.height,
        labelRotationDeg: box.labelRotationDeg,
        orientationLabel: box.orientationLabel,
        orientationAxes: box.orientationAxes,
      })
    }

    expect(seen).toEqual([
      expect.objectContaining({ orientationKey: 'LHW', yawQuarterTurn: 0, pitchQuarterTurn: 1, width: 600, height: 500, labelRotationDeg: 0, orientationAxes: { x: 'L+', y: 'H+', z: 'W-' }, orientationLabel: 'X:L+ Y:T+ Z:W-' }),
      expect.objectContaining({ orientationKey: 'LWH', yawQuarterTurn: 0, pitchQuarterTurn: 2, width: 500, height: 600, labelRotationDeg: 0, orientationAxes: { x: 'L+', y: 'W-', z: 'H-' }, orientationLabel: 'X:L+ Y:W- Z:T-' }),
      expect.objectContaining({ orientationKey: 'LHW', yawQuarterTurn: 0, pitchQuarterTurn: 3, width: 600, height: 500, labelRotationDeg: 0, orientationAxes: { x: 'L+', y: 'H-', z: 'W+' }, orientationLabel: 'X:L+ Y:T- Z:W+' }),
      expect.objectContaining({ orientationKey: 'LWH', yawQuarterTurn: 0, pitchQuarterTurn: 0, width: 500, height: 600, labelRotationDeg: 0, orientationAxes: { x: 'L+', y: 'W+', z: 'H+' }, orientationLabel: 'X:L+ Y:W+ Z:T+' }),
    ])
  })

  it('rotates left as the inverse of right', () => {
    const original = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 500,
      y: 500,
    }))

    const rightThenLeft = rotateBoxLeft90(rotateBoxRight90(original, 'box-1'), 'box-1').boxes[0]
    expect(rightThenLeft).toMatchObject({
      x: 500,
      y: 500,
      z: 0,
      length: 400,
      width: 500,
      height: 600,
      orientationKey: 'LWH',
      yawQuarterTurn: 0,
      pitchQuarterTurn: 0,
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
    })

    let draft = original
    for (let i = 0; i < 4; i += 1) {
      draft = rotateBoxLeft90(draft, 'box-1')
    }

    expect(draft.boxes[0]).toMatchObject({
      x: 500,
      y: 500,
      z: 0,
      length: 400,
      width: 500,
      height: 600,
      orientationKey: 'LWH',
      yawQuarterTurn: 0,
      pitchQuarterTurn: 0,
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
    })
  })

  it('rotates up as the inverse of down', () => {
    const original = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 500,
      y: 500,
    }))

    const downThenUp = rotateBoxUp90(rotateBoxDown90(original, 'box-1'), 'box-1').boxes[0]
    expect(downThenUp).toMatchObject({
      x: 500,
      y: 500,
      z: 0,
      length: 400,
      width: 500,
      height: 600,
      orientationKey: 'LWH',
      yawQuarterTurn: 0,
      pitchQuarterTurn: 0,
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
    })

    let draft = original
    for (let i = 0; i < 4; i += 1) {
      draft = rotateBoxUp90(draft, 'box-1')
    }

    expect(draft.boxes[0]).toMatchObject({
      x: 500,
      y: 500,
      z: 0,
      length: 400,
      width: 500,
      height: 600,
      orientationKey: 'LWH',
      yawQuarterTurn: 0,
      pitchQuarterTurn: 0,
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
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
    expect(dryRunRotation(draft, 'box-1', container(), 'left').rotatedBox?.orientationKey).toBe('WLH')
    expect(dryRunRotation(draft, 'box-1', container(), 'up').rotatedBox?.orientationKey).toBe('LHW')
  })

  it('keeps grounded boxes on the floor when rotation changes height', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'A',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 500,
      y: 500,
      z: 0,
    }))

    const down = rotateBoxDown90(draft, 'box-1')
    const rotated = down.boxes[0]

    expect(rotated).toMatchObject({ orientationKey: 'LHW', height: 500, z: 0 })
    expect(validateDraft(down, container()).filter((issue) => issue.boxId === 'box-1')).toEqual([])
  })

  it('allows grounded R then Shift+R to reach WHL instead of floating back to WLH', () => {
    const draft = rotateBoxRight90(addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-a',
      label: 'G',
      color: '#fff',
      length: 400,
      width: 500,
      height: 600,
      x: 500,
      y: 500,
      z: 0,
    })), 'box-1')

    const dry = dryRunRotation(draft, 'box-1', container(), 'down')
    const rotated = rotateBoxDown90(draft, 'box-1').boxes[0]

    expect(draft.boxes[0]).toMatchObject({ orientationKey: 'WLH', z: 0 })
    expect(dry.ok).toBe(true)
    expect(dry.rotatedBox).toMatchObject({ orientationKey: 'WHL', z: 0 })
    expect(dry.issues).toEqual([])
    expect(rotated).toMatchObject({ orientationKey: 'WHL', z: 0 })
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
      WLH: { length: 500, width: 400, height: 600, labelRotationDeg: 0 },
      LHW: { length: 400, width: 600, height: 500, labelRotationDeg: 0 },
      HLW: { length: 600, width: 400, height: 500, labelRotationDeg: 0 },
      WHL: { length: 500, width: 600, height: 400, labelRotationDeg: 0 },
      HWL: { length: 600, width: 500, height: 400, labelRotationDeg: 0 },
    } as const

    const expectedLabels = {
      LWH: 'X:L+ Y:W+ Z:T+',
      WLH: 'X:W+ Y:L+ Z:T+',
      LHW: 'X:L+ Y:T+ Z:W+',
      HLW: 'X:T+ Y:L+ Z:W+',
      WHL: 'X:W+ Y:T+ Z:L+',
      HWL: 'X:T+ Y:W+ Z:L+',
    } as const

    Object.entries(expected).forEach(([orientationKey, dimensions]) => {
      const next = setManualBoxOrientation(draft, 'box-1', orientationKey as keyof typeof expected)
      expect(next.boxes[0]).toMatchObject({
        ...dimensions,
        orientationKey,
        orientationLabel: expectedLabels[orientationKey as keyof typeof expectedLabels],
        orientationAxes: expect.any(Object),
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
    expect(labelRotationForManualOrientation('WHL')).toBe(0)
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

  it('validateDraft allows configured partial overhang as a warning instead of a blocking error', () => {
    const policy: SupportPolicy = {
      allowPartialOverhang: true,
      minSupportRatio: 0.25,
      warningSupportRatio: 0.5,
      supportMode: 'field-review',
    }
    let draft = emptyDraft()
    draft = addBox(draft, makeManualBox({
      id: 'base', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0,
    }))
    draft = setBoxPosition(addBox(draft, makeManualBox({
      id: 'top', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 250, y: 0,
    })), 'top', 250, 0, 600)

    const issues = validateDraft(draft, container(), policy)

    expect(issues).toEqual([
      expect.objectContaining({ type: 'floating', boxId: 'top', severity: 'warning', supportRatio: 0.375 }),
    ])
    expect(issues.some(isBlockingManualIssue)).toBe(false)
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

  it('validateDraft flags boxes above their max stack layer limit', () => {
    let draft = emptyDraft()
    draft = addBox(draft, makeManualBox({
      id: 'base', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0, maxStackLayers: 2,
    }))
    draft = setBoxPosition(addBox(draft, makeManualBox({
      id: 'middle', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0, maxStackLayers: 2,
    })), 'middle', 0, 0, 600)
    draft = setBoxPosition(addBox(draft, makeManualBox({
      id: 'top', cargoId: 'cargo-a', label: 'A', color: '#fff',
      length: 400, width: 500, height: 600, x: 0, y: 0, maxStackLayers: 2,
    })), 'top', 0, 0, 1200)

    const issues = validateDraft(draft, container())

    expect(issues).toEqual([
      expect.objectContaining({ type: 'max-stack-layers', boxId: 'top', stackLayer: 3, maxStackLayers: 2 }),
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
      labelRotationDeg: 270,
      yawQuarterTurn: 1,
      pitchQuarterTurn: 0,
      orientationAxes: { x: 'W+', y: 'L-', z: 'H+' },
      orientationLabel: 'X:W+ Y:L- Z:T+',
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

  it('toPlacedBoxes preserves manual rotation eligibility for face-label icons', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#f59e0b',
      length: 400, width: 500, height: 600, canRotate: false, x: 100, y: 200,
    }))

    const placed = toPlacedBoxes(draft, new Set())

    expect(placed[0]).toMatchObject({ canRotate: false })
  })

  it('toPlacedBoxes preserves max stack layer metadata', () => {
    const draft = addBox(emptyDraft(), makeManualBox({
      id: 'b1', cargoId: 'cargo-a', label: 'A', color: '#f59e0b',
      length: 400, width: 500, height: 600, maxStackLayers: 4, x: 100, y: 200,
    }))

    const placed = toPlacedBoxes(draft, new Set())

    expect(placed[0]).toMatchObject({ maxStackLayers: 4 })
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
    // Centre-pivot rotation: place the box with margin so the rotated footprint
    // still fits. Centre (1500,900) → rotated 800×1000 spans x[1100,1900] y[400,1400].
    const box = { id: 'a', cargoId: 'c', label: 'A', x: 1000, y: 500, z: 0, length: 1000, width: 800, height: 500, orientationKey: 'LWH' as const, labelRotationDeg: 0 as const, color: '#000' }
    const { ok, issues } = _dryRunRotation({ boxes: [box] }, 'a', container)
    expect(ok).toBe(true)
    expect(issues).toEqual([])
  })

  it('flags boundary when centre-pivot rotation pushes a corner box out of bounds', () => {
    // A box flush in the corner legitimately leaves the container when rotated about
    // its centre (the accepted tradeoff of pure geometric-centre rotation).
    const box = { id: 'a', cargoId: 'c', label: 'A', x: 0, y: 0, z: 0, length: 1000, width: 800, height: 500, orientationKey: 'LWH' as const, labelRotationDeg: 0 as const, color: '#000' }
    const { ok, issues } = _dryRunRotation({ boxes: [box] }, 'a', container)
    expect(ok).toBe(false)
    expect(issues.some((i) => i.type === 'boundary')).toBe(true)
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
