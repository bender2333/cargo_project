import { describe, expect, it } from 'vitest'
import { buildLabelStats, countDistinctLabels, normalizeCargoLabelColors } from './labels'
import type { CargoItem, LabelPackingStats } from '../types'

function cargo(overrides: Partial<CargoItem>): CargoItem {
  return {
    id: 'cargo',
    name: 'Cargo',
    label: 'A',
    length: 1000,
    width: 1000,
    height: 1000,
    weight: 100,
    quantity: 1,
    color: '#f59e0b',
    canRotate: true,
    stackable: true,
    ...overrides,
  }
}

describe('normalizeCargoLabelColors', () => {
  it('keeps one color per label so plan views do not split the same business label', () => {
    const items = normalizeCargoLabelColors([
      cargo({ id: 'first', label: 'A', color: '#111111' }),
      cargo({ id: 'second', label: 'a', color: '#222222' }),
      cargo({ id: 'third', label: 'B', color: '#333333' }),
    ])

    expect(items.map((item) => ({ id: item.id, label: item.label, color: item.color }))).toEqual([
      { id: 'first', label: 'A', color: '#111111' },
      { id: 'second', label: 'A', color: '#111111' },
      { id: 'third', label: 'B', color: '#333333' },
    ])
  })

  it('preserves full imported SKU labels while matching colors case-insensitively', () => {
    const items = normalizeCargoLabelColors([
      cargo({ id: 'first', label: 'TB-C10-EV_v1.1', color: '#111111' }),
      cargo({ id: 'second', label: 'tb-c10-ev_v1.1', color: '#222222' }),
      cargo({ id: 'third', label: 'TN-D01-EV_v1.1', color: '#333333' }),
    ])

    expect(items.map((item) => ({ id: item.id, label: item.label, color: item.color }))).toEqual([
      { id: 'first', label: 'TB-C10-EV_v1.1', color: '#111111' },
      { id: 'second', label: 'tb-c10-ev_v1.1', color: '#111111' },
      { id: 'third', label: 'TN-D01-EV_v1.1', color: '#333333' },
    ])
  })
})

// P2-3 RED tests — distinct business label count
describe('countDistinctLabels', () => {
  function stat(label: string, name: string): LabelPackingStats {
    return { label, name, color: '#000', planned: 1, placed: 1, unplaced: 0, layers: [1] }
  }

  it('counts two cargo definitions that share one business label as a single type', () => {
    // labelStats carries one entry per CargoItem, so `.length` overcounted types
    // whenever an operator entered two cargo rows under the same business label.
    const count = countDistinctLabels([
      stat('A', 'Pump'),
      stat('A', 'Valve'),
      stat('B', 'Crate'),
    ])

    expect(count).toBe(2)
  })

  it('treats case variants of one label as the same type, matching color normalization', () => {
    // normalizeCargoLabelColors assigns one color per label case-insensitively, so
    // the type count must use the same key or the summary contradicts the 3D colors.
    const count = countDistinctLabels([
      stat('TB-C10-EV_v1.1', 'Battery'),
      stat('tb-c10-ev_v1.1', 'Battery reorder'),
    ])

    expect(count).toBe(1)
  })

  it('ignores blank labels instead of counting them as a type', () => {
    const count = countDistinctLabels([stat('A', 'Pump'), stat('', 'Unlabelled'), stat('  ', 'Blank')])

    expect(count).toBe(1)
  })

  it('returns zero for an empty result', () => {
    expect(countDistinctLabels([])).toBe(0)
  })
})

describe('buildLabelStats', () => {
  it('aggregates multiple cargo rows that share one business label', () => {
    const stats = buildLabelStats([
      cargo({ id: 'a1', label: 'P', name: 'Pump A', quantity: 2, color: '#111' }),
      cargo({ id: 'a2', label: 'p', name: 'Pump B', quantity: 3, color: '#222' }),
      cargo({ id: 'b1', label: 'V', name: 'Valve', quantity: 1, color: '#333' }),
    ], [
      {
        id: 'box-1', cargoId: 'a1', label: 'P', name: 'Pump A', color: '#111',
        length: 1, width: 1, height: 1, weight: 1, x: 0, y: 0, z: 0,
        orientationKey: 'LWH', labelRotationDeg: 0, index: 1, physicalLayer: 1, depthLayer: 1,
        workStep: 1, supportType: 'floor', supportedBy: [],
      },
      {
        id: 'box-2', cargoId: 'a2', label: 'p', name: 'Pump B', color: '#222',
        length: 1, width: 1, height: 1, weight: 1, x: 0, y: 0, z: 1,
        orientationKey: 'LWH', labelRotationDeg: 0, index: 1, physicalLayer: 2, depthLayer: 1,
        workStep: 2, supportType: 'box', supportedBy: ['box-1'],
      },
    ] as never)

    expect(stats).toEqual([
      expect.objectContaining({ label: 'P', planned: 5, placed: 2, unplaced: 3, layers: [1, 2] }),
      expect.objectContaining({ label: 'V', planned: 1, placed: 0, unplaced: 1, layers: [] }),
    ])
  })
})
