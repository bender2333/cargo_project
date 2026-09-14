import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ContainerSpec, PlacementBox } from '../types'
import {
  layoutCompactness,
  unsupportedSpanRiskOf,
} from './packingLayoutQuality'
import { comparePackingQuality, packingQualityOf } from './packingObjective'
import { MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import type { PackingSearchState } from './packingSearchState'

function container(overrides: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: 'quality',
    label: 'quality',
    description: 'layout quality fixture',
    length: 2000,
    width: 2000,
    height: 2000,
    maxWeight: 10_000,
    doorGap: 0,
    topGap: 0,
    sideGap: 0,
    ...overrides,
  }
}

function box(overrides: Partial<PlacementBox> & Pick<PlacementBox, 'id'>): PlacementBox {
  return {
    cargoId: 'a',
    name: 'a',
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
    weight: 1,
    color: '#64748b',
    canRotate: false,
    stackable: true,
    physicalLayer: 1,
    workStep: 1,
    supportType: 'floor',
    supportedBy: [],
    ...overrides,
  }
}

function stateOf(placed: PlacementBox[], boxContainer = container()): PackingSearchState {
  return {
    container: boxContainer,
    cargoStates: [],
    emsList: [],
    placed,
    placedById: new Map(placed.map((entry) => [entry.id, entry])),
    usedWeight: placed.length,
    minSupportRatio: MINIMUM_SUPPORT_RATIO,
  }
}

describe('layout compactness metrics stay independent', () => {
  it('keeps a 400mm both-sides gap as inter-cargo and external residual, not an enclosed cavity', () => {
    const left = box({ id: 'left', x: 0, y: 0, length: 1000, width: 1000, height: 500 })
    const right = box({ id: 'right', index: 2, x: 0, y: 1400, length: 1000, width: 1000, height: 500, workStep: 2 })
    const compactness = layoutCompactness([left, right], container())

    expect(compactness.interCargoMaxMm).toBeGreaterThanOrEqual(400)
    expect(compactness.internalNotchVolume).toBe(0)
    expect(compactness.externalResidualVolume).toBeGreaterThan(0)
    expect(compactness.unsupportedSpanRisk).toBe(0)
  })

  it('does not reuse voxel occupancy loops in the objective or slot-relocation modules', () => {
    const objective = readFileSync(resolve('src/lib/packingObjective.ts'), 'utf8')
    const relocation = readFileSync(resolve('src/lib/packingSlotRelocation.ts'), 'utf8')
    expect(objective).not.toMatch(/new Uint8Array\(/)
    expect(relocation).not.toMatch(/new Uint8Array\(/)
  })
})

describe('unsupportedSpanRisk from real support rectangles', () => {
  it('scores a fully supported rider as 0 even if supportType is tagged partial', () => {
    const floor = box({ id: 'floor-1', supportType: 'floor' })
    const rider = box({
      id: 'rider-1',
      index: 2,
      z: 500,
      physicalLayer: 2,
      workStep: 2,
      supportType: 'partially-supported',
      supportedBy: ['floor-1'],
    })

    expect(unsupportedSpanRiskOf([floor, rider])).toBe(0)
    expect(packingQualityOf(stateOf([floor, rider])).unsupportedSpanRisk).toBe(0)
  })

  it('gives a floor box and a fully stacked box risk 0', () => {
    const floor = box({ id: 'floor-1' })
    const rider = box({
      id: 'rider-1',
      index: 2,
      z: 500,
      physicalLayer: 2,
      workStep: 2,
      supportType: 'fully-supported',
      supportedBy: ['floor-1'],
    })

    expect(unsupportedSpanRiskOf([floor])).toBe(0)
    expect(unsupportedSpanRiskOf([floor, rider])).toBe(0)
  })

  it('scores 50% support differently from 90% support on the same rider footprint', () => {
    const riderFootprint = { x: 0, y: 0, length: 1000, width: 1000, height: 500 }
    const halfFloor = box({ id: 'half', length: 500, width: 1000, height: 500 })
    const ninetyFloor = box({ id: 'ninety', length: 900, width: 1000, height: 500 })
    const halfRider = box({
      id: 'half-rider',
      ...riderFootprint,
      index: 2,
      z: 500,
      physicalLayer: 2,
      workStep: 2,
      supportType: 'partially-supported',
      supportedBy: ['half'],
    })
    const ninetyRider = box({
      id: 'ninety-rider',
      ...riderFootprint,
      index: 2,
      z: 500,
      physicalLayer: 2,
      workStep: 2,
      supportType: 'partially-supported',
      supportedBy: ['ninety'],
    })

    const halfRisk = unsupportedSpanRiskOf([halfFloor, halfRider])
    const ninetyRisk = unsupportedSpanRiskOf([ninetyFloor, ninetyRider])

    expect(halfRisk).toBeGreaterThan(0)
    expect(ninetyRisk).toBeGreaterThan(0)
    expect(halfRisk).not.toBe(ninetyRisk)
    expect(halfRisk).toBeGreaterThan(ninetyRisk)
    expect(halfRisk).toBe(500_000 * 1000)
    expect(ninetyRisk).toBe(100_000 * 1000)
  })

  it('does not double-count overlapping support rectangles', () => {
    const left = box({ id: 'left', x: 0, length: 600, width: 1000, height: 500 })
    const right = box({ id: 'right', index: 2, x: 200, length: 600, width: 1000, height: 500, workStep: 2 })
    const rider = box({
      id: 'rider',
      index: 3,
      x: 0,
      y: 0,
      z: 500,
      length: 1000,
      width: 1000,
      height: 500,
      physicalLayer: 2,
      workStep: 3,
      supportType: 'partially-supported',
      supportedBy: ['left', 'right'],
    })

    const unionSupportedArea = 800 * 1000
    const unsupportedArea = 1000 * 1000 - unionSupportedArea
    expect(unsupportedSpanRiskOf([left, right, rider])).toBe(unsupportedArea * 1000)
  })

  it('prefers the lower support risk when count and enclosed cavity match', () => {
    const stableFloor = box({ id: 'stable-floor' })
    const stableRider = box({
      id: 'stable-rider',
      index: 2,
      z: 500,
      physicalLayer: 2,
      workStep: 2,
      supportType: 'fully-supported',
      supportedBy: ['stable-floor'],
    })
    const riskyFloor = box({ id: 'risky-floor', length: 500, width: 1000 })
    const riskyRider = box({
      id: 'risky-rider',
      index: 2,
      z: 500,
      length: 1000,
      width: 1000,
      physicalLayer: 2,
      workStep: 2,
      supportType: 'partially-supported',
      supportedBy: ['risky-floor'],
    })

    const stable = packingQualityOf(stateOf([stableFloor, stableRider]))
    const risky = packingQualityOf(stateOf([riskyFloor, riskyRider]))

    expect(stable.placedCount).toBe(risky.placedCount)
    expect(stable.internalNotchVolume).toBe(risky.internalNotchVolume)
    expect(stable.unsupportedSpanRisk).toBe(0)
    expect(risky.unsupportedSpanRisk).toBeGreaterThan(0)
    expect(comparePackingQuality(stable, risky, 'quantity')).toBeLessThan(0)
  })
})
