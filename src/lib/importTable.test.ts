import { describe, expect, it } from 'vitest'
import { importColumnsForHeaderRow, importPreviewRows } from './importTable'

describe('import table projection', () => {
  it('uses the configured worksheet row as the header and removes blank cells', () => {
    const rows = [
      ['Report title'],
      ['Goods', 'Length', '', null, 'Quantity'],
      ['Crate', 800, '', null, 2],
    ]

    expect(importColumnsForHeaderRow(rows, 2)).toEqual(['Goods', 'Length', 'Quantity'])
  })

  it('projects array rows from the configured data start without treating skipped rows as cargo', () => {
    const rows = [
      ['Goods', 'Length', 'Quantity'],
      ['Units', 'mm', 'count'],
      ['Crate', 800, 2],
    ]

    expect(importPreviewRows(rows, 1, 3)).toEqual([
      { Goods: 'Crate', Length: 800, Quantity: 2 },
    ])
  })

  it('preserves object-row columns and values used by CSV imports', () => {
    const rows = [{ Goods: 'Pallet', Length: 1200, Quantity: 1 }]

    expect(importColumnsForHeaderRow(rows, 1)).toEqual(['Goods', 'Length', 'Quantity'])
    expect(importPreviewRows(rows, 1, 2)).toEqual(rows)
  })
})
