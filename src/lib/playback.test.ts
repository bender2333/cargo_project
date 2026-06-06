import { describe, expect, it } from 'vitest'
import type { PackingResult, PlacedBox } from '../types'
import { buildPlaybackSequence, currentBoxAt, visibleBoxesAt } from './playback'

function makeBox(id: string, step: number): PlacedBox {
  return {
    id,
    cargoId: `cargo-${id}`,
    name: `Box ${id}`,
    label: 'A',
    index: 0,
    color: '#000',
    x: 0,
    y: 0,
    z: 0,
    length: 100,
    width: 100,
    height: 100,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: 1,
    canRotate: true,
    stackable: true,
    physicalLayer: 1,
    workStep: step,
    supportedBy: [],
    supportType: 'floor',
  }
}

function makeResult(boxes: PlacedBox[]): PackingResult {
  return {
    placed: boxes,
    unplaced: [],
    layers: [],
    workSteps: boxes.map((b) => ({
      step: b.workStep,
      boxId: b.id,
      cargoId: b.cargoId,
      label: b.label,
      physicalLayer: b.physicalLayer,
      supportType: b.supportType,
    })),
    labelStats: [],
    diagnostics: [],
    totalCargoCount: boxes.length,
    placedCount: boxes.length,
    usedVolume: 0,
    containerVolume: 0,
    volumeUtilization: 0,
    usedWeight: 0,
    weightUtilization: 0,
  }
}

describe('playback', () => {
  it('handles empty / null result', () => {
    expect(buildPlaybackSequence(null).total).toBe(0)
    expect(buildPlaybackSequence(makeResult([])).total).toBe(0)
  })

  it('orders steps ascending and joins with placed boxes', () => {
    const boxes = [makeBox('a', 3), makeBox('b', 1), makeBox('c', 2)]
    const seq = buildPlaybackSequence(makeResult(boxes))
    expect(seq.total).toBe(3)
    expect(seq.steps.map((s) => s.box.id)).toEqual(['b', 'c', 'a'])
  })

  it('skips steps without a matching placed box (defensive)', () => {
    const boxes = [makeBox('a', 1)]
    const r = makeResult(boxes)
    r.workSteps.push({ step: 2, boxId: 'ghost', cargoId: 'ghost', label: 'Z', physicalLayer: 1, supportType: 'floor' })
    const seq = buildPlaybackSequence(r)
    expect(seq.total).toBe(1)
    expect(seq.steps[0].box.id).toBe('a')
  })

  it('visibleBoxesAt clamps cursor at both ends', () => {
    const boxes = [makeBox('a', 1), makeBox('b', 2), makeBox('c', 3)]
    const seq = buildPlaybackSequence(makeResult(boxes))
    expect(visibleBoxesAt(seq, 0)).toEqual([])
    expect(visibleBoxesAt(seq, -5)).toEqual([])
    expect(visibleBoxesAt(seq, 2).map((b) => b.id)).toEqual(['a', 'b'])
    expect(visibleBoxesAt(seq, 99).map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('currentBoxAt returns null at start/end and the box otherwise', () => {
    const boxes = [makeBox('a', 1), makeBox('b', 2)]
    const seq = buildPlaybackSequence(makeResult(boxes))
    expect(currentBoxAt(seq, 0)).toBeNull()
    expect(currentBoxAt(seq, 3)).toBeNull()
    expect(currentBoxAt(seq, 1)?.id).toBe('a')
    expect(currentBoxAt(seq, 2)?.id).toBe('b')
  })
})
