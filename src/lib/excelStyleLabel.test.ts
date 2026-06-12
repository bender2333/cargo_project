import { describe, expect, it } from 'vitest'
import { excelStyleLabel } from './excelStyleLabel'
import { normalizeCargoLabelColors } from './labels'
import type { CargoItem } from '../types'

describe('excelStyleLabel', () => {
  it('produces correct single-letter labels', () => {
    expect(excelStyleLabel(0)).toBe('A')
    expect(excelStyleLabel(1)).toBe('B')
    expect(excelStyleLabel(25)).toBe('Z')
  })

  it('produces correct two-letter labels after Z', () => {
    expect(excelStyleLabel(26)).toBe('AA')
    expect(excelStyleLabel(27)).toBe('AB')
    expect(excelStyleLabel(51)).toBe('AZ')
    expect(excelStyleLabel(52)).toBe('BA')
  })

  it('produces correct three-letter labels after ZZ', () => {
    expect(excelStyleLabel(702)).toBe('AAA')
  })

  it('generates 30 labels that are all unique (regression: old A-Z wraps at 27)', () => {
    const labels = Array.from({ length: 30 }, (_, i) => excelStyleLabel(i))
    const unique = new Set(labels)
    expect(unique.size).toBe(30)
  })

  it('combined with normalizeCargoLabelColors, 30 items get 30 distinct label→color mappings', () => {
    const colors = [
      '#f59e0b', '#0ea5e9', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6',
      '#ec4899', '#6366f1', '#84cc16', '#f97316', '#06b6d4', '#a855f7',
      '#10b981', '#f43f5e', '#3b82f6', '#eab308', '#64748b', '#d946ef',
      '#0d9488', '#e11d48', '#2563eb', '#ca8a04', '#475569', '#c026d3',
      '#059669', '#be123c', '#1d4ed8', '#a16207', '#334155', '#9333ea',
    ]
    const items: CargoItem[] = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      name: `Cargo ${i}`,
      label: excelStyleLabel(i),
      length: 100, width: 100, height: 100, weight: 10,
      quantity: 1, color: colors[i % colors.length],
      canRotate: true, stackable: true,
    }))
    const normalized = normalizeCargoLabelColors(items)
    const labelColorPairs = new Set(normalized.map((item) => `${item.label}|${item.color}`))
    expect(labelColorPairs.size).toBe(30)
  })
})
