import { describe, expect, it } from 'vitest'
import type { PlacedBox } from '../types'
import { faceLabelContent, faceLabelContentSignature } from './faceLabelContent'

const box = (overrides: Partial<PlacedBox> = {}): PlacedBox => ({
  id: 'box-1',
  cargoId: 'cargo-1',
  name: 'Long product name for display',
  label: 'LP',
  index: 1,
  x: 0,
  y: 0,
  z: 0,
  length: 1200,
  width: 800,
  height: 600,
  orientationKey: 'LWH',
  labelRotationDeg: 0,
  orientationLabel: 'X:L+ Y:W+ Z:T+',
  weight: 42,
  color: '#f97316',
  canRotate: true,
  stackable: true,
  maxStackLayers: 3,
  physicalLayer: 1,
  workStep: 1,
  supportType: 'floor',
  supportedBy: [],
  ...overrides,
})

describe('faceLabelContent', () => {
  it('summarizes rotatable stack-limited cargo for the 3D face badge', () => {
    const content = faceLabelContent(box())

    expect(content).toMatchObject({
      badge: 'LP',
      name: 'Long product name for display',
      icons: ['rotate', 'stack'],
      stackLayersText: '3',
      weightDimText: '42kg / 1200x800x600',
    })
    expect('orientationText' in content).toBe(false)
  })

  it('uses negative icons when rotation or stacking are disabled', () => {
    const content = faceLabelContent(box({ canRotate: false, stackable: false, maxStackLayers: undefined }))

    expect(content.icons).toEqual(['no-rotate', 'no-stack'])
    expect(content.stackLayersText).toBe('')
  })

  it('uses all visual cargo fields in the cache signature to avoid texture reuse across different cargo', () => {
    const base = faceLabelContentSignature(box())
    const differentWeight = faceLabelContentSignature(box({ weight: 43 }))
    const differentRotation = faceLabelContentSignature(box({ canRotate: false }))
    const differentSize = faceLabelContentSignature(box({ length: 1300 }))

    expect(new Set([base, differentWeight, differentRotation, differentSize]).size).toBe(4)
  })
})
