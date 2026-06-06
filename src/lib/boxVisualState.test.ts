import { describe, expect, it } from 'vitest'
import type { PlacedBox } from '../types'
import { boxVisualState } from './boxVisualState'

const box = (overrides: Partial<PlacedBox> = {}): PlacedBox => ({
  id: 'box-1',
  cargoId: 'cargo-1',
  name: 'Cargo',
  label: 'A',
  index: 1,
  x: 0,
  y: 0,
  z: 0,
  length: 1000,
  width: 1000,
  height: 500,
  orientationKey: 'LWH',
  labelRotationDeg: 0,
  weight: 10,
  color: '#f97316',
  canRotate: true,
  stackable: true,
  physicalLayer: 1,
  workStep: 1,
  supportType: 'floor',
  supportedBy: [],
  ...overrides,
})

describe('boxVisualState', () => {
  it('strongly fades non-current boxes only while a specific layer is selected', () => {
    const inactive = boxVisualState(box({ physicalLayer: 1 }), '2', 'all', null, undefined, false)
    const active = boxVisualState(box({ physicalLayer: 2 }), '2', 'all', null, undefined, false)

    expect(inactive.opacity).toBeLessThanOrEqual(0.1)
    expect(inactive.edgeOpacity).toBeLessThanOrEqual(0.05)
    expect(active.opacity).toBe(1)
    expect(active.edgeOpacity).toBeGreaterThan(0.7)
  })

  it('does not fade boxes when all layers are selected', () => {
    const visual = boxVisualState(box({ physicalLayer: 1 }), 'all', 'all', null, undefined, false)

    expect(visual.opacity).toBe(1)
  })
})
