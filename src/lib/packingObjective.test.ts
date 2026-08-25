import { describe, expect, it } from 'vitest'
import { comparePackingQuality, type PackingQuality } from './packingObjective'

function quality(overrides: Partial<PackingQuality> = {}): PackingQuality {
  return {
    placedCount: 500,
    usedVolume: 10_000_000,
    internalNotchVolume: 0,
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

  it('quantity prefers the smaller inter-cargo slot once count and notch match', () => {
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
