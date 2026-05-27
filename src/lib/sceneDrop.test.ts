import { describe, expect, it } from 'vitest'
import { resolveDropTarget } from './sceneDrop'
import type { ContainerSpec, PlacedBox } from '../types'
import type { SupportPolicy } from './placementSettings'

function makeContainer(): ContainerSpec {
  return { id: 't', label: 'T', description: '', length: 6000, width: 2400, height: 2600, maxWeight: 28000, doorGap: 0, topGap: 0, sideGap: 0 }
}

function makeBox(overrides: Partial<PlacedBox> & { id: string; x: number; y: number; z: number; length: number; width: number; height: number }): PlacedBox {
  return {
    cargoId: 'c', name: 'box', label: 'A', index: 0, orientationKey: 'LWH', labelRotationDeg: 0,
    weight: 1, color: '#000', stackable: true, physicalLayer: 1, workStep: 1, supportType: 'floor', supportedBy: [],
    ...overrides,
  } as PlacedBox
}

describe('resolveDropTarget', () => {
  it('lands on the ground when no box is below the cursor', () => {
    const target = resolveDropTarget({
      rayOrigin: { x: 1000, y: 1000, z: 2000 },
      rayDirection: { x: 0, y: 0, z: -1 },
      boxes: [],
      draggedBoxId: null,
      draggedSize: { length: 400, width: 300, height: 200 },
      container: makeContainer(),
    })
    expect(target.z).toBe(0)
    expect(target.surfaceBoxId).toBeNull()
    // centred on cursor: x = 1000 - 200, y = 1000 - 150
    expect(target.x).toBe(800)
    expect(target.y).toBe(850)
  })

  it('snaps onto the top face of a box directly under the cursor', () => {
    const boxes = [makeBox({ id: 'b', x: 500, y: 500, z: 0, length: 1000, width: 1000, height: 800 })]
    const target = resolveDropTarget({
      rayOrigin: { x: 1000, y: 1000, z: 3000 },
      rayDirection: { x: 0, y: 0, z: -1 },
      boxes,
      draggedBoxId: null,
      draggedSize: { length: 400, width: 300, height: 200 },
      container: makeContainer(),
    })
    expect(target.z).toBe(800)
    expect(target.surfaceBoxId).toBe('b')
    expect(target.x).toBe(800)
    expect(target.y).toBe(850)
  })

  it('picks the tallest box when two boxes are stacked vertically', () => {
    const boxes = [
      makeBox({ id: 'low', x: 500, y: 500, z: 0, length: 1000, width: 1000, height: 400 }),
      makeBox({ id: 'high', x: 600, y: 600, z: 400, length: 600, width: 600, height: 600 }),
    ]
    const target = resolveDropTarget({
      rayOrigin: { x: 900, y: 900, z: 3000 },
      rayDirection: { x: 0, y: 0, z: -1 },
      boxes,
      draggedBoxId: null,
      draggedSize: { length: 200, width: 200, height: 200 },
      container: makeContainer(),
    })
    // Ray going straight down from z=3000 hits high.top (z=1000) first.
    expect(target.surfaceBoxId).toBe('high')
    expect(target.z).toBe(1000)
  })

  it('ignores a box whose top would overflow the container ceiling once the new box is stacked', () => {
    const tall = makeBox({ id: 'tall', x: 500, y: 500, z: 0, length: 1000, width: 1000, height: 2400 })
    const target = resolveDropTarget({
      rayOrigin: { x: 1000, y: 1000, z: 3000 },
      rayDirection: { x: 0, y: 0, z: -1 },
      boxes: [tall],
      draggedBoxId: null,
      draggedSize: { length: 200, width: 200, height: 500 },
      container: makeContainer(), // height 2600
    })
    // 2400 + 500 > 2600 → overflow; falls back to ground.
    expect(target.surfaceBoxId).toBeNull()
    expect(target.z).toBe(0)
  })

  it('does not snap to the dragged box itself', () => {
    const dragged = makeBox({ id: 'self', x: 500, y: 500, z: 0, length: 1000, width: 1000, height: 500 })
    const target = resolveDropTarget({
      rayOrigin: { x: 1000, y: 1000, z: 3000 },
      rayDirection: { x: 0, y: 0, z: -1 },
      boxes: [dragged],
      draggedBoxId: 'self',
      draggedSize: { length: 200, width: 200, height: 200 },
      container: makeContainer(),
    })
    expect(target.surfaceBoxId).toBeNull()
    expect(target.z).toBe(0)
  })

  it('handles oblique rays (camera angle) and still snaps to the closest top face', () => {
    const boxes = [makeBox({ id: 'b', x: 500, y: 500, z: 0, length: 1000, width: 1000, height: 800 })]
    const target = resolveDropTarget({
      rayOrigin: { x: 0, y: 0, z: 2400 }, // off-corner camera
      rayDirection: { x: 1, y: 1, z: -1 },
      boxes,
      draggedBoxId: null,
      draggedSize: { length: 200, width: 200, height: 200 },
      container: makeContainer(),
    })
    // top z = 800; ray parametric: t = (800 - 2400) / -1 = 1600 → hx = 1600, hy = 1600 → outside box (500..1500). miss.
    // ground fallback: t = 2400 → hx = 2400, hy = 2400 → ground centred.
    expect(target.surfaceBoxId).toBeNull()
    expect(target.z).toBe(0)
  })

  it('skips surface snap when the dragged box is larger than 50% of the target footprint', () => {
    // surface 600×600; dragged 1000×1000 → overlap at most 600×600 = 360 000 mm²,
    // baseArea = 1e6 mm² → ratio 0.36 < 0.5 → must fall back to ground.
    const boxes = [makeBox({ id: 'small', x: 500, y: 500, z: 0, length: 600, width: 600, height: 500 })]
    const target = resolveDropTarget({
      rayOrigin: { x: 800, y: 800, z: 3000 },
      rayDirection: { x: 0, y: 0, z: -1 },
      boxes,
      draggedBoxId: null,
      draggedSize: { length: 1000, width: 1000, height: 400 },
      container: makeContainer(),
    })
    expect(target.surfaceBoxId).toBeNull()
    expect(target.z).toBe(0)
  })

  it('snaps when surface is at least 50% of the dragged footprint and cursor is centred', () => {
    const boxes = [makeBox({ id: 'big', x: 500, y: 500, z: 0, length: 800, width: 800, height: 500 })]
    const target = resolveDropTarget({
      rayOrigin: { x: 900, y: 900, z: 3000 },
      rayDirection: { x: 0, y: 0, z: -1 },
      boxes,
      draggedBoxId: null,
      draggedSize: { length: 400, width: 400, height: 400 },
      container: makeContainer(),
    })
    expect(target.surfaceBoxId).toBe('big')
    expect(target.z).toBe(500)
  })

  it('uses the configured support policy for partial-overhang surface snaps', () => {
    const policy: SupportPolicy = {
      allowPartialOverhang: true,
      minSupportRatio: 0.3,
      warningSupportRatio: 0.5,
      supportMode: 'field-review',
    }
    const boxes = [makeBox({ id: 'small', x: 500, y: 500, z: 0, length: 600, width: 600, height: 500 })]
    const target = resolveDropTarget({
      rayOrigin: { x: 800, y: 800, z: 3000 },
      rayDirection: { x: 0, y: 0, z: -1 },
      boxes,
      draggedBoxId: null,
      draggedSize: { length: 1000, width: 1000, height: 400 },
      container: makeContainer(),
      supportPolicy: policy,
    })

    expect(target.surfaceBoxId).toBe('small')
    expect(target.z).toBe(500)
    expect(target.supportRatio).toBeCloseTo(0.36)
    expect(target.supportSeverity).toBe('warning')
  })

  it('falls back to surface-centred placement when cursor placement would underflow 50% but surface is large enough', () => {
    // surface 1500×1500; dragged 1000×1000; cursor placed at corner so cursor-centred only
    // overlaps half — surface-centred should rescue.
    const boxes = [makeBox({ id: 'big', x: 0, y: 0, z: 0, length: 1500, width: 1500, height: 500 })]
    // Pointer at very corner — cursor-centred candidate would land at (-100, -100) etc.
    const target = resolveDropTarget({
      rayOrigin: { x: 50, y: 50, z: 3000 },
      rayDirection: { x: 0, y: 0, z: -1 },
      boxes,
      draggedBoxId: null,
      draggedSize: { length: 1000, width: 1000, height: 400 },
      container: makeContainer(),
    })
    // cursor-centred (-450, -450) overlaps surface (0..1500) by max 550×550 = 302500 / 1e6 = 30% → reject.
    // surface-centred (250, 250) → fully on surface → 100% → accept.
    expect(target.surfaceBoxId).toBe('big')
    expect(target.x).toBe(250)
    expect(target.y).toBe(250)
  })
})
