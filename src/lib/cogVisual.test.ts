import { describe, expect, it } from 'vitest'
import { buildCogOverlay, buildTruckSilhouette, computeSafeCogBox } from './cogVisual'
import type { CogResult } from './centerOfGravity'

const container = { length: 12000, width: 2400, height: 2600 }

describe('computeSafeCogBox', () => {
  it('returns a symmetric range centred on the container centre', () => {
    const box = computeSafeCogBox(container)
    expect(box.center.x).toBe(6000)
    expect(box.center.y).toBe(1200)
    expect(box.max.x - box.center.x).toBe(box.center.x - box.min.x)
    expect(box.max.y - box.center.y).toBe(box.center.y - box.min.y)
  })

  it('keeps the safe band in the lower portion of the container height', () => {
    const box = computeSafeCogBox(container)
    expect(box.min.z).toBeLessThan(container.height / 2)
    expect(box.max.z).toBeLessThan(container.height)
    expect(box.max.z).toBeGreaterThan(box.min.z)
  })

  it('scales the X range to ±10% of length', () => {
    const box = computeSafeCogBox(container)
    expect(box.max.x - box.min.x).toBeCloseTo(container.length * 0.2)
  })
})

describe('buildTruckSilhouette', () => {
  it('puts the cab in front of x=0 and trailer covering the container length', () => {
    const truck = buildTruckSilhouette(container)
    expect(truck.cabFront).toBeLessThan(0)
    expect(truck.cabBack).toBeLessThan(0)
    expect(truck.trailerStart).toBe(0)
    expect(truck.trailerEnd).toBe(container.length)
  })

  it('rear axle group sits in the back portion of the trailer', () => {
    const truck = buildTruckSilhouette(container)
    expect(truck.rearAxleX).toBeGreaterThan(container.length / 2)
    expect(truck.rearAxleX).toBeLessThan(container.length)
  })
})

describe('buildCogOverlay', () => {
  it('combines computed CoG with safe range and truck silhouette', () => {
    const cog: CogResult = {
      cog: { x: 5000, y: 1200, z: 1000 },
      center: { x: 6000, y: 1200, z: 1300 },
      offset: { x: -1000, y: 0, z: -300 },
      totalWeight: 500,
      warning: false,
      balanced: false,
    }
    const overlay = buildCogOverlay(cog, container)
    expect(overlay.cog.x).toBe(5000)
    expect(overlay.safe.center.x).toBe(6000)
    expect(overlay.truck?.trailerEnd).toBe(12000)
    expect(overlay.warning).toBe(false)
  })
})

import { buildCogOverlay as _buildCogOverlay, computeSafeCogBox as _computeSafeCogBox } from './cogVisual'
import { VEHICLE_PROFILES } from '../data/vehicleProfiles'

describe('vehicle profile influence', () => {
  const c = { length: 12000, width: 2400, height: 2600 }
  it('flatbed lowers the safe Z ceiling vs semi-trailer', () => {
    const semi = _computeSafeCogBox(c, VEHICLE_PROFILES['semi-trailer'])
    const flat = _computeSafeCogBox(c, VEHICLE_PROFILES['flatbed'])
    expect(flat.max.z).toBeLessThan(semi.max.z)
  })
  it('container-only profile produces no truck silhouette', () => {
    const overlay = _buildCogOverlay(
      { cog: c, center: c, offset: { x: 0, y: 0, z: 0 }, totalWeight: 0, warning: false, balanced: true } as never,
      c,
      'container-only',
    )
    expect(overlay.truck).toBeNull()
  })
})
