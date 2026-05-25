import { describe, expect, it } from 'vitest'
import {
  buildCogOverlay,
  buildGravityField,
  buildTruckGeometry,
  buildTruckSilhouette,
  computeSafeCogBox,
  GRAVITY_FIELD_MAX_POINTS,
} from './cogVisual'
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

describe('buildTruckGeometry', () => {
  it('places the trapezoidal cab in front of the trailer with wider back than front', () => {
    const geo = buildTruckGeometry(container)
    expect(geo).not.toBeNull()
    if (!geo) return
    expect(geo.cab.frontX).toBeLessThan(geo.cab.backX)
    expect(geo.cab.backX).toBeLessThan(0)
    expect(geo.cab.backHeight).toBeGreaterThan(geo.cab.frontHeight)
    expect(geo.cab.backWidth).toBeGreaterThan(geo.cab.frontWidth)
  })

  it('exposes a slanted windshield whose top is behind and above the bottom', () => {
    const geo = buildTruckGeometry(container)
    if (!geo) return
    expect(geo.windshield.topX).toBeGreaterThan(geo.windshield.bottomX)
    expect(geo.windshield.topZ).toBeGreaterThan(geo.windshield.bottomZ)
  })

  it('emits two axles with the rear one in the back portion of the trailer', () => {
    const geo = buildTruckGeometry(container)
    if (!geo) return
    expect(geo.axles).toHaveLength(2)
    expect(geo.axles[0]!.x).toBeLessThan(container.length / 2)
    expect(geo.axles[1]!.x).toBeGreaterThan(container.length / 2)
    expect(geo.axles[1]!.x).toBeLessThan(container.length)
    expect(geo.axles[0]!.dualSpacing).toBeGreaterThan(0)
    expect(geo.axles[0]!.halfTrack).toBeGreaterThan(0)
  })

  it('returns null when the profile opts out of drawing a silhouette', () => {
    const geo = buildTruckGeometry(container, VEHICLE_PROFILES['container-only'])
    expect(geo).toBeNull()
  })
})

describe('buildGravityField', () => {
  it('samples a grid with severity 0 closest to the CoG and 1 at the farthest corner', () => {
    const cog = { x: container.length / 2, y: container.width / 2 }
    const field = buildGravityField(container, cog)
    const minSeverity = Math.min(...field.map((p) => p.severity))
    const maxSeverity = Math.max(...field.map((p) => p.severity))
    expect(minSeverity).toBeGreaterThanOrEqual(0)
    expect(minSeverity).toBeLessThan(0.2)
    expect(maxSeverity).toBeCloseTo(1, 5)
  })

  it('shifts the high-severity region opposite of an offset CoG', () => {
    const offsetCog = { x: 1000, y: 600 }
    const field = buildGravityField(container, offsetCog)
    const leftFront = field.find((p) => p.x === 0 && p.y === 0)
    const rightBack = field.find((p) => p.x === container.length && p.y === container.width)
    expect(leftFront && rightBack).toBeTruthy()
    expect((rightBack as { severity: number }).severity)
      .toBeGreaterThan((leftFront as { severity: number }).severity)
  })

  it('caps the point count by lowering grid resolution', () => {
    const field = buildGravityField(container, { x: 0, y: 0 }, { nx: 20, ny: 20 })
    expect(field.length).toBeLessThanOrEqual(GRAVITY_FIELD_MAX_POINTS)
    const customCap = buildGravityField(container, { x: 0, y: 0 }, { maxPoints: 12 })
    expect(customCap.length).toBeLessThanOrEqual(12)
  })
})

describe('buildCogOverlay with gravity field toggle', () => {
  const baseCog: CogResult = {
    cog: { x: 4000, y: 1000, z: 800 },
    center: { x: 6000, y: 1200, z: 1300 },
    offset: { x: -2000, y: -200, z: -500 },
    totalWeight: 1000,
    warning: false,
    balanced: false,
  }

  it('omits the gravity field by default', () => {
    const overlay = buildCogOverlay(baseCog, container)
    expect(overlay.gravityField).toBeNull()
  })

  it('populates the gravity field when enabled', () => {
    const overlay = buildCogOverlay(baseCog, container, 'semi-trailer', { gravityFieldOn: true })
    expect(overlay.gravityField && overlay.gravityField.length).toBeGreaterThan(0)
    expect(overlay.truckGeometry).not.toBeNull()
  })
})
