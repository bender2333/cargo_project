import { describe, expect, it } from 'vitest'
import { COMFORT_RATIO, CRITICAL_RATIO, computeCenterOfGravity } from './centerOfGravity'
import type { ContainerSpec, PlacedBox } from '../types'

function makeContainer(length = 12000, width = 2300, height = 2300): ContainerSpec {
  return {
    id: 'test',
    label: 'TEST',
    description: '',
    length,
    width,
    height,
    maxWeight: 28000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
  }
}

function makeBox(overrides: Partial<PlacedBox>): PlacedBox {
  return {
    id: overrides.id ?? 'b',
    cargoId: 'c',
    name: 'box',
    label: 'A',
    index: 0,
    x: 0,
    y: 0,
    z: 0,
    length: 1000,
    width: 1000,
    height: 1000,
    orientationKey: 'LWH',
    labelRotationDeg: 0,
    weight: 100,
    color: '#000',
    stackable: true,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    ...overrides,
  }
}

describe('computeCenterOfGravity', () => {
  it('returns zero offset and balanced when no cargo is placed', () => {
    const container = makeContainer()
    const r = computeCenterOfGravity([], container)
    expect(r.totalWeight).toBe(0)
    expect(r.offset).toEqual({ x: 0, y: 0, z: 0 })
    expect(r.warning).toBe(false)
    expect(r.balanced).toBe(true)
  })

  it('returns zero offset when all weights are zero (defensive)', () => {
    const container = makeContainer()
    const boxes = [makeBox({ id: 'a', weight: 0 }), makeBox({ id: 'b', weight: 0 })]
    const r = computeCenterOfGravity(boxes, container)
    expect(r.totalWeight).toBe(0)
    expect(r.warning).toBe(false)
  })

  it('computes weighted centroid for a single box', () => {
    const container = makeContainer(2000, 2000, 2000)
    const box = makeBox({ x: 500, y: 500, z: 500, length: 1000, width: 1000, height: 1000, weight: 100 })
    const r = computeCenterOfGravity([box], container)
    expect(r.cog).toEqual({ x: 1000, y: 1000, z: 1000 })
    expect(r.offset).toEqual({ x: 0, y: 0, z: 0 })
    expect(r.balanced).toBe(true)
  })

  it('weights heavier boxes more strongly than lighter ones', () => {
    const container = makeContainer(2000, 2000, 2000)
    const light = makeBox({ id: 'l', x: 0, y: 500, z: 500, length: 500, width: 1000, height: 1000, weight: 10 })
    const heavy = makeBox({ id: 'h', x: 1500, y: 500, z: 500, length: 500, width: 1000, height: 1000, weight: 90 })
    const r = computeCenterOfGravity([light, heavy], container)
    // light centroid x=250, heavy centroid x=1750; weighted: (250*10 + 1750*90) / 100 = 1600
    expect(r.cog.x).toBe(1600)
    expect(r.offset.x).toBe(600)
  })

  it('flags a warning when offset exceeds CRITICAL_RATIO on any axis', () => {
    const container = makeContainer(10000, 2000, 2000)
    // place a heavy box near the door (far end of length)
    const box = makeBox({ x: 8500, y: 500, z: 500, length: 1000, width: 1000, height: 1000, weight: 500 })
    const r = computeCenterOfGravity([box], container)
    // cog.x = 9000; offset.x = 9000 - 5000 = 4000; ratio = 4000 / 10000 = 0.4 > 0.1
    expect(r.warning).toBe(true)
    expect(r.balanced).toBe(false)
    expect(Math.abs(r.offset.x) / container.length).toBeGreaterThan(CRITICAL_RATIO)
  })

  it('marks balanced when offset is within COMFORT_RATIO on every axis', () => {
    const container = makeContainer(10000, 2000, 2000)
    const a = makeBox({ id: 'a', x: 4500, y: 500, z: 500, length: 1000, width: 1000, height: 1000, weight: 100 })
    const b = makeBox({ id: 'b', x: 5500, y: 500, z: 500, length: 1000, width: 1000, height: 1000, weight: 100 })
    const r = computeCenterOfGravity([a, b], container)
    expect(r.balanced).toBe(true)
    expect(Math.abs(r.offset.x) / container.length).toBeLessThanOrEqual(COMFORT_RATIO)
  })
})
