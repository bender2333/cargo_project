import { describe, expect, it } from 'vitest'
import { computeRemainingCapacity } from './remainingCapacity'
import type { ContainerSpec, PlacedBox } from '../types'

function makeContainer(): ContainerSpec {
  return { id: 't', label: 'T', description: '', length: 12000, width: 2400, height: 2600, maxWeight: 28000, doorGap: 0, topGap: 0, sideGap: 0 }
}

function makeBox(overrides: Partial<PlacedBox> & { id: string }): PlacedBox {
  return {
    cargoId: 'c', name: 'box', label: 'A', index: 0, x: 0, y: 0, z: 0,
    length: 1000, width: 1000, height: 1000, orientationKey: 'LWH', labelRotationDeg: 0,
    weight: 100, color: '#000', stackable: true, physicalLayer: 1, workStep: 1, supportType: 'floor', supportedBy: [],
    ...overrides,
  } as PlacedBox
}

describe('computeRemainingCapacity', () => {
  it('returns total capacity when no boxes are placed', () => {
    const r = computeRemainingCapacity([], makeContainer())
    expect(r.usedVolume).toBe(0)
    expect(r.usedWeight).toBe(0)
    expect(r.volumeRatio).toBe(0)
    expect(r.weightRatio).toBe(0)
    expect(r.remainingVolume).toBe(r.totalVolume)
    expect(r.remainingWeight).toBe(r.totalWeight)
  })

  it('sums weighted usage for floor-level boxes', () => {
    const boxes = [
      makeBox({ id: 'a', z: 0, length: 1000, width: 1000, height: 1000, weight: 500 }),
      makeBox({ id: 'b', z: 0, x: 1100, length: 1000, width: 1000, height: 1000, weight: 300 }),
    ]
    const r = computeRemainingCapacity(boxes, makeContainer())
    expect(r.usedVolume).toBe(2 * 1e9)
    expect(r.usedWeight).toBe(800)
    expect(r.usedFloorArea).toBe(2 * 1e6)
  })

  it('excludes stacked boxes from floor-area calculation', () => {
    const boxes = [
      makeBox({ id: 'a', z: 0, length: 1000, width: 1000, height: 1000 }),
      makeBox({ id: 'b', z: 1000, length: 1000, width: 1000, height: 1000 }),
    ]
    const r = computeRemainingCapacity(boxes, makeContainer())
    expect(r.usedFloorArea).toBe(1e6) // only one box on the floor
  })

  it('clamps ratios at 1 when boxes exceed capacity (defensive)', () => {
    const big = makeBox({ id: 'big', length: 13000, width: 3000, height: 3000, weight: 99999 })
    const r = computeRemainingCapacity([big], makeContainer())
    expect(r.volumeRatio).toBe(1)
    expect(r.weightRatio).toBe(1)
  })

  it('handles container with zero maxWeight gracefully', () => {
    const c: ContainerSpec = { ...makeContainer(), maxWeight: 0 }
    const r = computeRemainingCapacity([makeBox({ id: 'a', weight: 100 })], c)
    expect(r.weightRatio).toBe(0)
    expect(r.remainingWeight).toBe(0)
  })
})
