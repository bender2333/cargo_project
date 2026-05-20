import { describe, expect, it } from 'vitest'
import type { CargoItem } from '../types'
import { normalizeCargoLabelColors } from './labels'

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
})
