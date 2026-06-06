import { describe, expect, it } from 'vitest'
import type { PlacedBox } from '../types'
import { buildBoxLabelModes } from './labelDeconfliction'

const box = (overrides: Partial<PlacedBox>): PlacedBox => ({
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
  color: '#f97316',
  canRotate: true,
  stackable: true,
  physicalLayer: 1,
  workStep: 1,
  supportType: 'floor',
  supportedBy: [],
  ...overrides,
})

describe('buildBoxLabelModes', () => {
  it('uses compact labels for covered all-layer top projections', () => {
    const modes = buildBoxLabelModes({
      boxes: [
        box({ id: 'box-a', label: 'A', z: 0, physicalLayer: 1 }),
        box({ id: 'box-q', label: 'Q', z: 1800, physicalLayer: 4 }),
      ],
      projectionMode: 'top',
      activeLayerId: 'all',
      activeLabelId: 'all',
    })

    expect(modes.get('box-a')).toBe('compact')
    expect(modes.get('box-q')).toBe('full')
  })

  it('keeps filtered labels full so review focus is not hidden', () => {
    const modes = buildBoxLabelModes({
      boxes: [
        box({ id: 'box-a', label: 'A', z: 0, physicalLayer: 1 }),
        box({ id: 'box-q', label: 'Q', z: 1800, physicalLayer: 4 }),
      ],
      projectionMode: 'top',
      activeLayerId: '1',
      activeLabelId: 'all',
    })

    expect(modes.get('box-a')).toBe('full')
    expect(modes.get('box-q')).toBe('full')
  })
})
