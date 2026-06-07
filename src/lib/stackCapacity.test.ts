import { describe, expect, it } from 'vitest'
import type { CargoItem, PlacedBox } from '../types'
import { stackCapacity, violatesStackChain } from './stackCapacity'

const cargo = (overrides: Partial<CargoItem> = {}): CargoItem => ({
  id: 'cargo',
  name: 'Cargo',
  label: 'C',
  length: 400,
  width: 500,
  height: 600,
  weight: 10,
  quantity: 1,
  color: '#64748b',
  canRotate: false,
  stackable: true,
  ...overrides,
})

const box = (overrides: Partial<PlacedBox>): PlacedBox => ({
  id: 'box',
  cargoId: 'cargo',
  name: 'Cargo',
  label: 'C',
  index: 1,
  x: 0,
  y: 0,
  z: 0,
  length: 400,
  width: 500,
  height: 600,
  orientationKey: 'LWH',
  labelRotationDeg: 0,
  weight: 10,
  color: '#64748b',
  canRotate: false,
  stackable: true,
  physicalLayer: 1,
  workStep: 1,
  supportType: 'floor',
  supportedBy: [],
  ...overrides,
})

describe('stackCapacity', () => {
  it('normalizes stackability into one capacity scalar', () => {
    expect(stackCapacity(cargo({ stackable: false, maxStackLayers: 8 }))).toBe(1)
    expect(stackCapacity(cargo({ stackable: true, maxStackLayers: 3 }))).toBe(3)
    expect(stackCapacity(cargo({ stackable: true, maxStackLayers: undefined }))).toBe(Number.POSITIVE_INFINITY)
  })

  it('detects capacity and ground-only violations through the same support chain', () => {
    const base = box({ id: 'base', physicalLayer: 1, maxStackLayers: 2 })
    const middle = box({ id: 'middle', physicalLayer: 2, supportedBy: ['base'] })
    const top = box({ id: 'top', physicalLayer: 3, supportedBy: ['middle'] })
    const byId = new Map([base, middle, top].map((item) => [item.id, item]))

    expect(violatesStackChain(top, byId)).toMatchObject({
      type: 'capacity',
      limitedBoxId: 'base',
      stackLayer: 3,
      stackCapacity: 2,
    })
    expect(violatesStackChain(middle, byId)).toBeNull()

    const groundOnlyTop = box({ id: 'ground-only', physicalLayer: 2, groundOnly: true, supportedBy: ['base'] })
    expect(violatesStackChain(groundOnlyTop, new Map([...byId, [groundOnlyTop.id, groundOnlyTop]]))).toMatchObject({
      type: 'ground-only',
      limitedBoxId: 'ground-only',
      stackLayer: 2,
    })
  })
})
