import { describe, expect, it } from 'vitest'
import { parseImportTemplatePayload } from './importTemplatePayload.mjs'

const validSeparate = {
  name: 'Box layout',
  mapping: { length: 'L', width: 'W', height: 'H', quantity: 'Qty' },
  units: { length: 'mm', width: 'mm', height: 'mm' },
  headerRow: 1,
  startRow: 2,
  dimensionMode: 'separate',
}

describe('parseImportTemplatePayload', () => {
  it('accepts a complete separate mapping without weight', () => {
    const result = parseImportTemplatePayload(validSeparate)
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        name: 'Box layout',
        mapping: { length: 'L', width: 'W', height: 'H', quantity: 'Qty' },
        dimensionMode: 'separate',
      }),
    })
    if (result.ok) {
      expect(result.value.mapping).not.toHaveProperty('weight')
    }
  })

  it('rejects an empty name', () => {
    expect(parseImportTemplatePayload({ ...validSeparate, name: '   ' })).toEqual({
      ok: false,
      code: 'invalid-template',
      message: 'Template name is required',
    })
  })

  it('rejects missing required dimensions', () => {
    expect(parseImportTemplatePayload({
      ...validSeparate,
      mapping: { length: 'L', width: 'W' },
    })).toEqual({
      ok: false,
      code: 'invalid-template',
      message: 'Incomplete dimension mapping',
    })
  })

  it('rejects duplicate active column mappings', () => {
    expect(parseImportTemplatePayload({
      ...validSeparate,
      mapping: { length: 'L', width: 'L', height: 'H' },
    })).toEqual({
      ok: false,
      code: 'invalid-template',
      message: 'Duplicate column mapping',
    })
  })

  it('accepts combined mode without a weight mapping', () => {
    const result = parseImportTemplatePayload({
      name: 'Combined layout',
      mapping: { quantity: 'Qty' },
      units: { length: 'mm', width: 'mm', height: 'mm' },
      dimensionMode: 'combined',
      combinedColumn: 'Size',
      dimensionOrder: ['length', 'width', 'height'],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.combinedColumn).toBe('Size')
      expect(result.value.mapping).not.toHaveProperty('weight')
    }
  })
})
