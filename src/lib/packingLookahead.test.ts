import { describe, expect, it } from 'vitest'
import type { CargoItem } from '../types'
import { bestBlocksForSpace } from './blocks'
import { splitEMS, type EmptyMaximalSpace } from './emsSpace'
import { canPlaceBox, canStageBlock, MINIMUM_SUPPORT_RATIO } from './packingFeasibility'
import {
  QUANTITY_COUNT_NEAR_WINDOW,
  compareBlockPlacement,
  scoreRemainingEmsQuality,
  type BlockChoiceMetrics,
  type RemainingEmsQuality,
} from './packingLookahead'

function cargo(overrides: Partial<CargoItem> & Pick<CargoItem, 'id' | 'length' | 'width' | 'height' | 'quantity'>): CargoItem {
  return {
    name: overrides.name ?? overrides.id,
    label: overrides.label ?? overrides.id,
    weight: 8,
    color: '#64748b',
    canRotate: true,
    stackable: true,
    ...overrides,
  }
}

function metrics(overrides: Partial<BlockChoiceMetrics> & Pick<BlockChoiceMetrics, 'count' | 'quality'>): BlockChoiceMetrics {
  return {
    cargoId: 'c13',
    volume: overrides.count * 1_000_000,
    footprintArea: overrides.count * 1000,
    waste: 0,
    axisFill: 0.9,
    minAxisFill: 0.8,
    point: { x: 0, y: 0, z: 0 },
    ...overrides,
  }
}

const emptyQuality = (overrides: Partial<RemainingEmsQuality> = {}): RemainingEmsQuality => ({
  nextCountBound: 0,
  nextVolumeBound: 0,
  deadVolume: 0,
  narrowVolume: 0,
  fragmentCount: 0,
  ...overrides,
})

describe('one-step remaining EMS quality', () => {
  const c13 = cargo({ id: 'c13', length: 530, width: 305, height: 360, quantity: 54 })
  const c10 = cargo({ id: 'c10', length: 530, width: 305, height: 310, quantity: 56 })
  const ems: EmptyMaximalSpace[] = [{ x: 0, y: 0, z: 0, length: 5758, width: 2000, height: 360 }]

  it('gives the 9x6 C13 leftover a higher next-count bound than the 18x3 leftover', () => {
    const remaining = [
      { item: c13, remaining: 0 },
      { item: c10, remaining: 56 },
    ]
    const after18x3 = scoreRemainingEmsQuality(splitEMS(ems, { x: 0, y: 0, z: 0, length: 5490, width: 1590, height: 360 }), remaining)
    const after9x6 = scoreRemainingEmsQuality(splitEMS(ems, { x: 0, y: 0, z: 0, length: 4770, width: 1830, height: 360 }), remaining)

    expect(after9x6.narrowVolume).toBeLessThan(after18x3.narrowVolume)
    expect(compareBlockPlacement(
      metrics({ count: 54, axisFill: 0.83, quality: after9x6 }),
      metrics({ count: 54, axisFill: 0.95, quality: after18x3 }),
      'quantity',
    )).toBeLessThan(0)
  })

  it('does not pick a one-piece lead that leaves a long enterable narrow channel', () => {
    const greedy = metrics({
      count: 11,
      axisFill: 0.99,
      quality: emptyQuality({ nextCountBound: 2, narrowVolume: 800_000_000 }),
    })
    const compact = metrics({
      count: 10,
      axisFill: 0.8,
      quality: emptyQuality({ nextCountBound: 8, narrowVolume: 0 }),
    })

    expect(QUANTITY_COUNT_NEAR_WINDOW).toBe(1)
    expect(compareBlockPlacement(compact, greedy, 'quantity')).toBeLessThan(0)
  })

  it('keeps a two-piece quantity lead even if leftover quality is worse', () => {
    const greedy = metrics({
      count: 12,
      quality: emptyQuality({ nextCountBound: 0, deadVolume: 8_000_000 }),
    })
    const compact = metrics({
      count: 10,
      quality: emptyQuality({ nextCountBound: 20, deadVolume: 0 }),
    })

    expect(compareBlockPlacement(greedy, compact, 'quantity')).toBeLessThan(0)
  })

  it('prefers continuous leftover over a fragmented same-count leftover', () => {
    const fragmented = metrics({
      count: 54,
      axisFill: 0.95,
      quality: emptyQuality({ nextCountBound: 10, fragmentCount: 4, deadVolume: 1 }),
    })
    const continuous = metrics({
      count: 54,
      axisFill: 0.83,
      quality: emptyQuality({ nextCountBound: 15, fragmentCount: 2, deadVolume: 1 }),
    })

    expect(compareBlockPlacement(continuous, fragmented, 'quantity')).toBeLessThan(0)
  })

  it('treats size-fit leftover as an optimistic bound, not a proven placeable count', () => {
    const floating = cargo({ id: 'air', length: 500, width: 500, height: 500, quantity: 8 })
    const leftover: EmptyMaximalSpace = { x: 0, y: 0, z: 500, length: 2000, width: 1000, height: 500 }
    const fitted = bestBlocksForSpace(floating, 8, leftover)
    expect(fitted.some((block) => block.count > 0), 'size-fit must still find a geometric block').toBe(true)

    const quality = scoreRemainingEmsQuality([leftover], [{ item: floating, remaining: 8 }])
    expect(quality.nextCountBound).toBeGreaterThan(0)

    const box = { length: 500, width: 500, height: 500 }
    const container = {
      id: 'air',
      label: 'air',
      description: 'air',
      length: 2000,
      width: 1000,
      height: 1500,
      maxWeight: 10_000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }
    expect(canPlaceBox({ x: 0, y: 0, z: 500 }, box, container, [], new Map(), floating)).toBe(false)

    const count = fitted[0].count
    const stagedBlock = fitted[0]
    expect(canStageBlock({
      container,
      cargoStates: [{ item: floating, itemIndex: 0, label: 'air', remaining: 8, nextIndex: 1 }],
      emsList: [leftover],
      placed: [],
      placedById: new Map(),
      usedWeight: 0,
      minSupportRatio: MINIMUM_SUPPORT_RATIO,
    }, {
      cargoId: floating.id,
      state: { item: floating, itemIndex: 0, label: 'air', remaining: 8, nextIndex: 1 },
      block: stagedBlock,
      ems: leftover,
      point: { x: leftover.x, y: leftover.y, z: leftover.z },
      waste: leftover.length * leftover.width * leftover.height - stagedBlock.volume,
    })).toBe(false)

    expect(Object.prototype.hasOwnProperty.call(quality, 'feasibleCount')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(quality, 'provenCount')).toBe(false)

    // Leftover bound is a ranking signal only: a 2-piece current lead still wins.
    // The unsupported leftover must not be scored as if those nextCountBound pieces were already placed.
    const fewerNow = metrics({
      cargoId: 'air',
      count: 4,
      quality: { ...quality, narrowVolume: 0, deadVolume: 0, fragmentCount: 1 },
    })
    const moreNow = metrics({
      cargoId: 'air',
      count: 4 + 2,
      quality: emptyQuality({ nextCountBound: 0 }),
    })
    expect(quality.nextCountBound).toBeGreaterThanOrEqual(count)
    expect(compareBlockPlacement(moreNow, fewerNow, 'quantity')).toBeLessThan(0)
  })
})
