import { describe, expect, it } from 'vitest'
import type { ContainerSpec, PlacementBox } from '../types'
import { comparePackingQuality, packingQualityOf, type PackingQuality } from './packingObjective'
import { MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import type { PackingSearchState } from './packingSearchState'

function quality(overrides: Partial<PackingQuality> = {}): PackingQuality {
  return {
    placedCount: 500,
    usedVolume: 10_000_000,
    internalNotchVolume: 0,
    unsupportedSpanRisk: 0,
    interCargoMaxMm: 0,
    deadEmsVolume: 0,
    externalResidualVolume: 0,
    ...overrides,
  }
}

function sign(value: number) {
  return value < 0 ? -1 : value > 0 ? 1 : 0
}

describe('comparePackingQuality', () => {
  it('quantity prefers a feasible 524/400mm external slot over a compact 504/150mm layout', () => {
    const compact504 = quality({
      placedCount: 504,
      usedVolume: 12_000_000,
      internalNotchVolume: 0,
      unsupportedSpanRisk: 0,
      interCargoMaxMm: 150,
      deadEmsVolume: 0,
      externalResidualVolume: 1_000_000,
    })
    const legal524 = quality({
      placedCount: 524,
      usedVolume: 12_400_000,
      internalNotchVolume: 0,
      unsupportedSpanRisk: 0,
      interCargoMaxMm: 400,
      deadEmsVolume: 8_000_000,
      externalResidualVolume: 4_000_000,
    })

    expect(comparePackingQuality(legal524, compact504, 'quantity')).toBeLessThan(0)
    expect(comparePackingQuality(compact504, legal524, 'quantity')).toBeGreaterThan(0)
  })

  it('quantity ranks a legal 524 above 506 and 504 because placedCount is the primary key', () => {
    const compact504 = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      unsupportedSpanRisk: 0,
      interCargoMaxMm: 150,
    })
    const legal524 = quality({
      placedCount: 524,
      internalNotchVolume: 0,
      unsupportedSpanRisk: 0,
      interCargoMaxMm: 400,
    })
    const compact506 = quality({
      placedCount: 506,
      usedVolume: 11_000_000,
      internalNotchVolume: 0,
      unsupportedSpanRisk: 0,
      interCargoMaxMm: 180,
      deadEmsVolume: 8_000_000,
      externalResidualVolume: 2_000_000,
    })

    expect(comparePackingQuality(compact506, compact504, 'quantity')).toBeLessThan(0)
    expect(comparePackingQuality(compact506, legal524, 'quantity')).toBeGreaterThan(0)
    expect(comparePackingQuality(legal524, compact504, 'quantity')).toBeLessThan(0)
  })

  it('quantity prefers 506 pieces over a tighter 504 with no interior notch', () => {
    const fewerCompact = quality({
      placedCount: 504,
      usedVolume: 12_000_000,
      internalNotchVolume: 0,
      interCargoMaxMm: 0,
      deadEmsVolume: 0,
      externalResidualVolume: 0,
    })
    const moreWithSlot = quality({
      placedCount: 506,
      usedVolume: 11_000_000,
      internalNotchVolume: 125_000,
      interCargoMaxMm: 400,
      deadEmsVolume: 8_000_000,
      externalResidualVolume: 2_000_000,
    })

    expect(comparePackingQuality(moreWithSlot, fewerCompact, 'quantity')).toBeLessThan(0)
    expect(comparePackingQuality(fewerCompact, moreWithSlot, 'quantity')).toBeGreaterThan(0)
  })

  it('quantity breaks an equal count by the smaller interior notch volume', () => {
    const noNotch = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      interCargoMaxMm: 400,
      deadEmsVolume: 9_000_000,
    })
    const hasNotch = quality({
      placedCount: 504,
      internalNotchVolume: 125_000,
      interCargoMaxMm: 0,
      deadEmsVolume: 0,
    })

    expect(comparePackingQuality(noNotch, hasNotch, 'quantity')).toBeLessThan(0)
    expect(comparePackingQuality(hasNotch, noNotch, 'quantity')).toBeGreaterThan(0)
  })

  it('quantity prefers the lower unsupported-span risk once count and interior notch match', () => {
    const stable = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      unsupportedSpanRisk: 10,
      interCargoMaxMm: 400,
    })
    const risky = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      unsupportedSpanRisk: 80,
      interCargoMaxMm: 0,
    })

    expect(comparePackingQuality(stable, risky, 'quantity')).toBeLessThan(0)
    expect(comparePackingQuality(risky, stable, 'quantity')).toBeGreaterThan(0)
  })

  it('quantity prefers the smaller inter-cargo slot once count, notch, and support risk match', () => {
    const tight = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      interCargoMaxMm: 50,
      deadEmsVolume: 9_000_000,
    })
    const wide = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      interCargoMaxMm: 199,
      deadEmsVolume: 0,
    })

    expect(comparePackingQuality(tight, wide, 'quantity')).toBeLessThan(0)
    expect(comparePackingQuality(wide, tight, 'quantity')).toBeGreaterThan(0)
  })

  it('volume prefers a larger used volume even when it places fewer pieces', () => {
    const bulky = quality({
      usedVolume: 20_000_000,
      placedCount: 10,
      internalNotchVolume: 125_000,
      interCargoMaxMm: 400,
    })
    const manySmall = quality({
      usedVolume: 19_000_000,
      placedCount: 100,
      internalNotchVolume: 0,
      interCargoMaxMm: 0,
    })

    expect(comparePackingQuality(bulky, manySmall, 'volume')).toBeLessThan(0)
    expect(comparePackingQuality(manySmall, bulky, 'volume')).toBeGreaterThan(0)
  })

  it('volume prefers more pieces only after used volume is tied', () => {
    const more = quality({ usedVolume: 20_000_000, placedCount: 100, internalNotchVolume: 125_000 })
    const fewer = quality({ usedVolume: 20_000_000, placedCount: 90, internalNotchVolume: 0 })

    expect(comparePackingQuality(more, fewer, 'volume')).toBeLessThan(0)
    expect(comparePackingQuality(fewer, more, 'volume')).toBeGreaterThan(0)
  })

  it('uses dead EMS and external residual only after the mode primary keys are equal', () => {
    const quantityLead = quality({
      placedCount: 506,
      deadEmsVolume: 50_000_000,
      externalResidualVolume: 50_000_000,
    })
    const quantityFewerClean = quality({
      placedCount: 504,
      deadEmsVolume: 0,
      externalResidualVolume: 0,
    })
    expect(comparePackingQuality(quantityLead, quantityFewerClean, 'quantity')).toBeLessThan(0)

    const samePrimaryDead = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      interCargoMaxMm: 50,
      deadEmsVolume: 1_000_000,
      externalResidualVolume: 50_000_000,
    })
    const samePrimaryLive = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      interCargoMaxMm: 50,
      deadEmsVolume: 8_000_000,
      externalResidualVolume: 0,
    })
    expect(comparePackingQuality(samePrimaryDead, samePrimaryLive, 'quantity')).toBeLessThan(0)

    const sameThroughDead = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      interCargoMaxMm: 50,
      deadEmsVolume: 1_000_000,
      externalResidualVolume: 2_000_000,
    })
    const moreExternal = quality({
      placedCount: 504,
      internalNotchVolume: 0,
      interCargoMaxMm: 50,
      deadEmsVolume: 1_000_000,
      externalResidualVolume: 9_000_000,
    })
    expect(comparePackingQuality(sameThroughDead, moreExternal, 'quantity')).toBeLessThan(0)

    const volumeLead = quality({
      usedVolume: 21_000_000,
      placedCount: 10,
      deadEmsVolume: 50_000_000,
      externalResidualVolume: 50_000_000,
    })
    const volumeLessClean = quality({
      usedVolume: 20_000_000,
      placedCount: 200,
      deadEmsVolume: 0,
      externalResidualVolume: 0,
    })
    expect(comparePackingQuality(volumeLead, volumeLessClean, 'volume')).toBeLessThan(0)
  })

  it('is a deterministic antisymmetric pure function and ties only when every numeric field matches', () => {
    const a = quality({
      placedCount: 504,
      usedVolume: 12_345_678,
      internalNotchVolume: 0,
      interCargoMaxMm: 50,
      deadEmsVolume: 1,
      externalResidualVolume: 2,
    })
    const b = quality({
      placedCount: 506,
      usedVolume: 11_000_000,
      internalNotchVolume: 125_000,
      interCargoMaxMm: 400,
      deadEmsVolume: 8,
      externalResidualVolume: 9,
    })
    const cloneA = quality({ ...a })

    expect(comparePackingQuality(a, a, 'quantity')).toBe(0)
    expect(comparePackingQuality(a, a, 'volume')).toBe(0)
    expect(comparePackingQuality(a, cloneA, 'quantity')).toBe(0)
    expect(comparePackingQuality(a, cloneA, 'volume')).toBe(0)

    expect(sign(comparePackingQuality(a, b, 'quantity'))).toBe(-sign(comparePackingQuality(b, a, 'quantity')))
    expect(sign(comparePackingQuality(a, b, 'volume'))).toBe(-sign(comparePackingQuality(b, a, 'volume')))

    expect(comparePackingQuality(a, b, 'quantity')).toBe(comparePackingQuality(a, b, 'quantity'))
    expect(comparePackingQuality(a, b, 'volume')).toBe(comparePackingQuality(a, b, 'volume'))

    const sameExceptVolume = quality({ ...a, usedVolume: a.usedVolume + 1 })
    expect(comparePackingQuality(a, sameExceptVolume, 'quantity')).toBe(0)
    expect(comparePackingQuality(a, sameExceptVolume, 'volume')).not.toBe(0)
  })
})

describe('packingQualityOf support risk', () => {
  it('scores unsupported span from the real supportType on placed boxes, not from empty voxels', () => {
    const container: ContainerSpec = {
      id: 'risk',
      label: 'risk',
      description: 'risk',
      length: 2000,
      width: 1000,
      height: 1000,
      maxWeight: 10_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }
    const floor: PlacementBox = {
      id: 'floor-1',
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
      labelRotationDeg: 0 as const,
      weight: 1,
      color: '#64748b',
      canRotate: false,
      stackable: true,
      physicalLayer: 1,
      workStep: 1,
      supportType: 'floor',
      supportedBy: [],
    }
    const rider: PlacementBox = {
      ...floor,
      id: 'rider-1',
      index: 2,
      z: 500,
      workStep: 2,
      physicalLayer: 2,
      supportType: 'partially-supported',
      supportedBy: ['floor-1'],
    }
    const state: PackingSearchState = {
      container,
      cargoStates: [],
      emsList: [],
      placed: [floor, rider],
      placedById: new Map([[floor.id, floor], [rider.id, rider]]),
      usedWeight: 2,
      minSupportRatio: MINIMUM_SUPPORT_RATIO,
    }

    expect(packingQualityOf(state).unsupportedSpanRisk).toBe(1000 * 1000)
    expect(packingQualityOf({ ...state, placed: [floor], placedById: new Map([[floor.id, floor]]) }).unsupportedSpanRisk).toBe(0)
  })
})
