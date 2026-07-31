import { describe, expect, it } from 'vitest'
import type { ContainerSpec, PlacementBox, PlacedBox } from '../types'
import { assignWorkStepsBySupport, finalizePlacementGeometry } from './finalizePackingResult'

const container: ContainerSpec = {
  id: 'test',
  label: 'Test',
  description: '',
  length: 3000,
  width: 2000,
  height: 2000,
  maxWeight: 10_000,
  doorGap: 0,
  topGap: 0,
  sideGap: 0,
}

function candidate(overrides: Partial<PlacementBox> & Pick<PlacementBox, 'id'>): PlacementBox {
  return {
    id: overrides.id,
    cargoId: overrides.cargoId ?? `cargo-${overrides.id}`,
    name: overrides.name ?? overrides.id,
    label: overrides.label ?? overrides.id,
    index: overrides.index ?? 1,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    z: overrides.z ?? 0,
    length: overrides.length ?? 500,
    width: overrides.width ?? 500,
    height: overrides.height ?? 500,
    orientationKey: overrides.orientationKey ?? 'LWH',
    labelRotationDeg: overrides.labelRotationDeg ?? 0,
    weight: overrides.weight ?? 1,
    color: overrides.color ?? '#000000',
    canRotate: overrides.canRotate ?? true,
    stackable: overrides.stackable ?? true,
    physicalLayer: overrides.physicalLayer ?? 1,
    workStep: overrides.workStep ?? 1,
    supportType: overrides.supportType ?? 'floor',
    supportedBy: overrides.supportedBy ?? [],
    orientationAxes: overrides.orientationAxes,
  }
}

function completed(overrides: Partial<PlacedBox> & Pick<PlacedBox, 'id'>): PlacedBox {
  return { ...candidate(overrides), depthLayer: overrides.depthLayer ?? 1 }
}

describe('packing result finalization', () => {
  it('rejects cyclic support graphs instead of inventing an arbitrary loading order', () => {
    const boxes = [
      completed({ id: 'a', supportedBy: ['b'] }),
      completed({ id: 'b', supportedBy: ['a'] }),
    ]

    expect(() => assignWorkStepsBySupport(boxes, container)).toThrow(/cyclic support graph.*a.*b/i)
  })

  it('rejects duplicate box ids before building the support graph', () => {
    const boxes = [completed({ id: 'duplicate' }), completed({ id: 'duplicate' })]

    expect(() => assignWorkStepsBySupport(boxes, container)).toThrow(/duplicate placed box id: duplicate/i)
  })

  it('uses locale-independent code-unit ordering for otherwise equal boxes', () => {
    const boxes = [completed({ id: 'a' }), completed({ id: 'Z' })]

    expect(assignWorkStepsBySupport(boxes, container).map((box) => box.id)).toEqual(['Z', 'a'])
  })

  it('does not label an unsupported above-floor box as floor-supported', () => {
    const result = finalizePlacementGeometry([candidate({ id: 'floating', z: 500 })], container)

    expect(result.placed[0]).toMatchObject({
      physicalLayer: 1,
      supportType: 'partially-supported',
      supportedBy: [],
    })
  })

  it('owns its output without mutating or aliasing input boxes', () => {
    const boxes = [
      candidate({ id: 'top', z: 500, supportedBy: ['stale'] }),
      candidate({ id: 'base', supportedBy: ['stale'] }),
    ]
    const snapshot = structuredClone(boxes)

    const result = finalizePlacementGeometry(boxes, container)

    expect(boxes).toEqual(snapshot)
    expect(result.placed).not.toBe(boxes)
    result.placed.forEach((box, index) => {
      expect(box).not.toBe(boxes[index])
      expect(box.supportedBy).not.toBe(boxes[index].supportedBy)
    })
  })
  it('deep-clones nested orientation axes in its finalized output', () => {
    const boxes = [candidate({
      id: 'axes',
      orientationAxes: { x: 'L+', y: 'W+', z: 'H+' },
    })]

    const result = finalizePlacementGeometry(boxes, container)
    boxes[0].orientationAxes!.x = 'W+'

    expect(result.placed[0].orientationAxes).toEqual({ x: 'L+', y: 'W+', z: 'H+' })
    expect(result.placed[0].orientationAxes).not.toBe(boxes[0].orientationAxes)
  })
})
