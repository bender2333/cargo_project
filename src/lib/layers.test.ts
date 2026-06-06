import { describe, expect, it } from 'vitest'
import type { PlacedBox } from '../types'
import { buildPackingLayers } from './layers'

function box(overrides: Partial<PlacedBox>): PlacedBox {
  return {
    id: 'box',
    cargoId: 'cargo',
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
    color: '#f59e0b',
    canRotate: true,
    stackable: true,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    ...overrides,
  }
}

describe('buildPackingLayers', () => {
  it('aggregates physical layers by support-derived layer instead of z buckets', () => {
    const layers = buildPackingLayers([
      box({ id: 'base', label: 'A', physicalLayer: 1, z: 0, height: 1000, weight: 20 }),
      box({ id: 'low-top', label: 'B', physicalLayer: 2, z: 500, supportedBy: ['base'], supportType: 'fully-supported' }),
      box({ id: 'high-top', label: 'B', physicalLayer: 2, z: 1000, supportedBy: ['base'], supportType: 'fully-supported' }),
    ])

    expect(layers).toEqual([
      {
        id: '1',
        physicalLayer: 1,
        minZ: 0,
        maxZ: 1000,
        count: 1,
        weight: 20,
        volume: 1_000_000_000,
        labels: [{ label: 'A', color: '#f59e0b', count: 1 }],
        supportedBy: [],
      },
      {
        id: '2',
        physicalLayer: 2,
        minZ: 500,
        maxZ: 1500,
        count: 2,
        weight: 20,
        volume: 1_000_000_000,
        labels: [{ label: 'B', color: '#f59e0b', count: 2 }],
        supportedBy: ['base'],
      },
    ])
  })
})
