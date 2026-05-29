import { describe, expect, it } from 'vitest'
import type { PlacedBox } from '../types'
import { rotateBoxDown90, rotateBoxRight90, makeManualBox, addBox, emptyDraft } from './manualPlacement'
import {
  baseDimensionsFromPlaced,
  faceLabelRotation,
  orientationAxesOf,
  orientationBasisVectors,
} from './orientationTransform'

const placed = (overrides: Partial<PlacedBox>): PlacedBox => ({
  id: 'box-1',
  cargoId: 'cargo-1',
  name: 'Cargo',
  label: 'A',
  index: 1,
  x: 0,
  y: 0,
  z: 0,
  length: 400,
  width: 500,
  height: 600,
  orientationKey: 'LWH',
  labelRotationDeg: 0,
  weight: 1,
  color: '#ffffff',
  stackable: true,
  physicalLayer: 1,
  workStep: 1,
  supportType: 'floor',
  supportedBy: [],
  ...overrides,
})

describe('orientationTransform', () => {
  it('uses identity axes and basis vectors for an unrotated LWH box', () => {
    const box = placed({})

    expect(orientationAxesOf(box)).toEqual({ x: 'L+', y: 'W+', z: 'H+' })
    expect(orientationBasisVectors(orientationAxesOf(box))).toEqual({
      length: { x: 1, y: 0, z: 0 },
      width: { x: 0, y: 1, z: 0 },
      height: { x: 0, y: 0, z: 1 },
    })
    expect(faceLabelRotation(orientationAxesOf(box), 'top')).toBe(0)
    expect(faceLabelRotation(orientationAxesOf(box), 'front')).toBe(0)
    expect(faceLabelRotation(orientationAxesOf(box), 'side')).toBe(0)
  })

  it('derives axes for automatic packing boxes that only have an orientation key', () => {
    const box = placed({ length: 500, width: 400, orientationKey: 'WLH', labelRotationDeg: 90 })

    expect(orientationAxesOf(box)).toEqual({ x: 'W+', y: 'L+', z: 'H+' })
    expect(faceLabelRotation(orientationAxesOf(box), 'top')).toBe(90)
    expect(baseDimensionsFromPlaced(box)).toEqual({ length: 400, width: 500, height: 600 })
  })

  it('tracks R as a real four-step rotation around the world height axis', () => {
    let draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-1',
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
      const axes = orientationAxesOf(draft.boxes[0])
      seen.push({
        axes,
        basis: orientationBasisVectors(axes),
        top: faceLabelRotation(axes, 'top'),
        side: faceLabelRotation(axes, 'side'),
      })
    }

    expect(seen).toEqual([
      {
        axes: { x: 'W+', y: 'L-', z: 'H+' },
        basis: { length: { x: 0, y: -1, z: 0 }, width: { x: 1, y: 0, z: 0 }, height: { x: 0, y: 0, z: 1 } },
        top: 270,
        side: 0,
      },
      {
        axes: { x: 'L-', y: 'W-', z: 'H+' },
        basis: { length: { x: -1, y: 0, z: 0 }, width: { x: 0, y: -1, z: 0 }, height: { x: 0, y: 0, z: 1 } },
        top: 180,
        side: 0,
      },
      {
        axes: { x: 'W-', y: 'L+', z: 'H+' },
        basis: { length: { x: 0, y: 1, z: 0 }, width: { x: -1, y: 0, z: 0 }, height: { x: 0, y: 0, z: 1 } },
        top: 90,
        side: 0,
      },
      {
        axes: { x: 'L+', y: 'W+', z: 'H+' },
        basis: { length: { x: 1, y: 0, z: 0 }, width: { x: 0, y: 1, z: 0 }, height: { x: 0, y: 0, z: 1 } },
        top: 0,
        side: 0,
      },
    ])
  })

  it('tracks Shift+R as a real four-step rotation around the world length axis', () => {
    let draft = addBox(emptyDraft(), makeManualBox({
      id: 'box-1',
      cargoId: 'cargo-1',
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
      const axes = orientationAxesOf(draft.boxes[0])
      seen.push({
        axes,
        front: faceLabelRotation(axes, 'front'),
        side: faceLabelRotation(axes, 'side'),
      })
    }

    expect(seen).toEqual([
      { axes: { x: 'L+', y: 'H+', z: 'W-' }, front: 0, side: 270 },
      { axes: { x: 'L+', y: 'W-', z: 'H-' }, front: 0, side: 180 },
      { axes: { x: 'L+', y: 'H-', z: 'W+' }, front: 0, side: 90 },
      { axes: { x: 'L+', y: 'W+', z: 'H+' }, front: 0, side: 0 },
    ])
  })

  it('computes face rotations from signed axes for compound yaw and pitch', () => {
    const axes = { x: 'H+', y: 'L-', z: 'W-' } as const

    expect(orientationBasisVectors(axes)).toEqual({
      length: { x: 0, y: -1, z: 0 },
      width: { x: 0, y: 0, z: -1 },
      height: { x: 1, y: 0, z: 0 },
    })
    expect(faceLabelRotation(axes, 'top')).toBe(270)
    expect(faceLabelRotation(axes, 'front')).toBe(0)
    expect(faceLabelRotation(axes, 'side')).toBe(270)
  })
})
