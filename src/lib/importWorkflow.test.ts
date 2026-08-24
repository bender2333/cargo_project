import { describe, it, expect } from 'vitest'
import {
  translateImportIssue,
  buildImportMessages,
  importMappingValueFromTemplate,
  mappedColumnsForTemplateValue,
  missingMappedColumns,
  emptyImportMappingValue,
  validateImportMappingValue,
  sameImportMappingValue,
  type ImportIssue,
} from './importWorkflow'
import type { ImportTemplate } from '../types'
import type { ImportMappingValue } from './importMapping'

describe('translateImportIssue', () => {
  it('translates cm-converted to Chinese', () => {
    const issue: ImportIssue = { code: 'cm-converted', row: 5, message: 'fallback' }
    expect(translateImportIssue(issue, 'zh')).toBe('第 5 行已从厘米换算为毫米。')
  })

  it('translates invalid-quantity to English', () => {
    const issue: ImportIssue = { code: 'invalid-quantity', row: 3, message: 'fallback' }
    expect(translateImportIssue(issue, 'en')).toContain('Row 3')
    expect(translateImportIssue(issue, 'en')).toContain('invalid quantity')
  })

  it('returns message when code not found', () => {
    const issue: ImportIssue = { code: 'unknown-code', row: 2, message: 'custom message' }
    expect(translateImportIssue(issue, 'zh')).toBe('custom message')
  })
})

describe('buildImportMessages', () => {
  it('builds complete message list', () => {
    const result = {
      summary: {
        importedRows: 5,
        mappedFields: ['label', 'length', 'width'],
        convertedCentimeterRows: 2,
        skippedRows: 1,
      },
      errors: [{ code: 'invalid-dimensions', row: 3, message: 'err' }],
      warnings: [{ code: 'cm-converted', row: 5, message: 'warn' }],
    }
    const labels = {
      importSuccess: 'Success',
      importMappedFields: 'Mapped',
      importConvertedRows: 'Converted',
      importSkippedRows: 'Skipped',
      importIssue: 'Issue',
      importWarning: 'Warning',
    }
    const messages = buildImportMessages(result, labels, 'en')
    expect(messages).toHaveLength(6)
    expect(messages[0]).toContain('Success')
    expect(messages[0]).toContain('5')
    expect(messages[1]).toContain('label, length, width')
  })
})

describe('importMappingValueFromTemplate', () => {
  it('converts template to mapping value', () => {
    const template: ImportTemplate = {
      id: 't1',
      name: 'Test',
      mapping: { length: 'L', width: 'W', height: 'H', quantity: 'Q' },
      units: { length: 'mm', width: 'mm', height: 'cm' },
      headerRow: 2,
      startRow: 3,
      dimensionMode: 'separate',
      combinedColumn: '',
      dimensionOrder: ['length', 'width', 'height'],
      defaultValues: { quantity: 1, canRotate: true, stackable: false },
      mergeRows: 'none',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const value = importMappingValueFromTemplate(template)
    expect(value.mapping.length).toBe('L')
    expect(value.headerRow).toBe(2)
    expect(value.defaults.stackable).toBe(false)
    expect(value.defaults).toEqual({ quantity: 1, canRotate: true, stackable: false })
    expect(value.defaults).not.toHaveProperty('weight')
  })
})

describe('mappedColumnsForTemplateValue', () => {
  it('returns separate columns', () => {
    const value: ImportMappingValue = {
      mapping: { length: 'L', width: 'W', height: 'H', quantity: 'Q' },
      units: { length: 'mm', width: 'mm', height: 'mm' },
      headerRow: 1,
      startRow: 2,
      dimensionMode: 'separate',
      combinedColumn: '',
      dimensionOrder: ['length', 'width', 'height'],
      defaults: { quantity: 1, canRotate: true, stackable: true },
    }
    const columns = mappedColumnsForTemplateValue(value)
    expect(columns).toContain('L')
    expect(columns).toContain('W')
    expect(columns).toContain('H')
    expect(columns).toContain('Q')
  })

  it('returns combined column and skips L/W/H', () => {
    const value: ImportMappingValue = {
      mapping: { dimensions: 'Size', length: 'L', width: 'W', height: 'H', quantity: 'Q' },
      units: { length: 'mm', width: 'mm', height: 'mm' },
      headerRow: 1,
      startRow: 2,
      dimensionMode: 'combined',
      combinedColumn: 'Size',
      dimensionOrder: ['length', 'width', 'height'],
      defaults: { quantity: 1, canRotate: true, stackable: true },
    }
    const columns = mappedColumnsForTemplateValue(value)
    expect(columns).toContain('Size')
    expect(columns).toContain('Q')
    expect(columns).not.toContain('L')
    expect(columns).not.toContain('W')
    expect(columns).not.toContain('H')
  })
})

describe('missingMappedColumns', () => {
  it('returns empty when all columns present', () => {
    const value: ImportMappingValue = {
      mapping: { length: 'L', width: 'W', height: 'H', quantity: 'Q' },
      units: { length: 'mm', width: 'mm', height: 'mm' },
      headerRow: 1,
      startRow: 2,
      dimensionMode: 'separate',
      combinedColumn: '',
      dimensionOrder: ['length', 'width', 'height'],
      defaults: { quantity: 1, canRotate: true, stackable: true },
    }
    const missing = missingMappedColumns(value, ['L', 'W', 'H', 'Q', 'Name'])
    expect(missing).toHaveLength(0)
  })

  it('returns missing columns', () => {
    const value: ImportMappingValue = {
      mapping: { length: 'Length', width: 'Width', height: 'Height', quantity: 'Qty' },
      units: { length: 'mm', width: 'mm', height: 'mm' },
      headerRow: 1,
      startRow: 2,
      dimensionMode: 'separate',
      combinedColumn: '',
      dimensionOrder: ['length', 'width', 'height'],
      defaults: { quantity: 1, canRotate: true, stackable: true },
    }
    const missing = missingMappedColumns(value, ['Length', 'Width'])
    expect(missing).toContain('Height')
    expect(missing).toContain('Qty')
  })
})

function mappingValue(overrides: Partial<ImportMappingValue> = {}): ImportMappingValue {
  return {
    mapping: {},
    units: { length: 'auto', width: 'auto', height: 'auto' },
    headerRow: 1,
    startRow: 2,
    dimensionMode: 'separate',
    combinedColumn: '',
    dimensionOrder: ['length', 'width', 'height'],
    defaults: { quantity: 1, canRotate: true, stackable: true },
    ...overrides,
  }
}

describe('emptyImportMappingValue', () => {
  it('starts every source column unmapped in separate mode', () => {
    const value = emptyImportMappingValue()
    expect(value.dimensionMode).toBe('separate')
    expect(value.combinedColumn).toBe('')
    expect(value.mapping.length).toBe('')
    expect(value.mapping.width).toBe('')
    expect(value.mapping.height).toBe('')
    expect(value.mapping.weight).toBe('')
    expect(value.mapping.quantity).toBe('')
    expect(value.headerRow).toBe(1)
    expect(value.startRow).toBe(2)
  })
})

describe('validateImportMappingValue', () => {
  it('reports missing length, width, and height for a blank separate mapping', () => {
    const result = validateImportMappingValue(emptyImportMappingValue(), null)
    expect(result.missingRequired).toEqual(['length', 'width', 'height'])
    expect(result.duplicateColumns).toEqual([])
    expect(result.missingColumns).toEqual([])
    expect(result.valid).toBe(false)
  })

  it('requires only combinedColumn and a unique three-field dimensionOrder in combined mode', () => {
    const complete = mappingValue({
      dimensionMode: 'combined',
      combinedColumn: 'Size',
      dimensionOrder: ['height', 'width', 'length'],
      mapping: { quantity: 'Qty' },
    })
    expect(validateImportMappingValue(complete, null)).toEqual({
      missingRequired: [],
      duplicateColumns: [],
      missingColumns: [],
      valid: true,
    })

    const incomplete = mappingValue({
      dimensionMode: 'combined',
      combinedColumn: '',
      dimensionOrder: ['length', 'length', 'width'],
    })
    expect(validateImportMappingValue(incomplete, null)).toEqual({
      missingRequired: ['combinedColumn', 'dimensionOrder'],
      duplicateColumns: [],
      missingColumns: [],
      valid: false,
    })
  })

  it('ignores inactive dimension mappings when detecting duplicates', () => {
    const combined = mappingValue({
      dimensionMode: 'combined',
      combinedColumn: 'Size',
      mapping: { length: 'Size', width: 'Size', height: 'Size', quantity: 'Qty' },
    })
    expect(validateImportMappingValue(combined, null)).toEqual({
      missingRequired: [],
      duplicateColumns: [],
      missingColumns: [],
      valid: true,
    })

    const separate = mappingValue({
      mapping: { length: 'L', width: 'W', height: 'H', dimensions: 'L' },
      combinedColumn: 'L',
    })
    expect(validateImportMappingValue(separate, null)).toEqual({
      missingRequired: [],
      duplicateColumns: [],
      missingColumns: [],
      valid: true,
    })
  })

  it('returns the source column when two active fields map to it', () => {
    const result = validateImportMappingValue(mappingValue({
      mapping: { length: 'W', width: 'W', height: 'H' },
    }), null)
    expect(result.duplicateColumns).toEqual(['W'])
    expect(result.missingRequired).toEqual([])
    expect(result.valid).toBe(false)
  })

  it('skips missing-column checks when no sample file is loaded', () => {
    const value = mappingValue({
      mapping: { length: 'L', width: 'W', height: 'H' },
    })
    expect(validateImportMappingValue(value, null)).toEqual({
      missingRequired: [],
      duplicateColumns: [],
      missingColumns: [],
      valid: true,
    })
  })

  it('reports every mapped column as missing when the loaded file has no headers', () => {
    const value = mappingValue({
      mapping: { length: 'L', width: 'W', height: 'H' },
    })
    expect(validateImportMappingValue(value, [])).toEqual({
      missingRequired: [],
      duplicateColumns: [],
      missingColumns: ['L', 'W', 'H'],
      valid: false,
    })
  })

  it('returns missingColumns when a selected template references absent file headers', () => {
    const value = mappingValue({
      mapping: { length: 'Length', width: 'Width', height: 'Height', quantity: 'Qty' },
    })
    const result = validateImportMappingValue(value, ['Length', 'Width'])
    expect(result.missingColumns).toEqual(['Height', 'Qty'])
    expect(result.valid).toBe(false)
  })
})

describe('sameImportMappingValue', () => {
  it('treats mapping, units, rows, mode, combined column, order, and defaults as the configuration', () => {
    const left = mappingValue({
      mapping: { length: 'L', width: 'W', height: 'H' },
      units: { length: 'mm', width: 'cm', height: 'auto' },
      headerRow: 2,
      startRow: 4,
      dimensionMode: 'combined',
      combinedColumn: 'Size',
      dimensionOrder: ['width', 'height', 'length'],
      defaults: { quantity: 2, canRotate: false, stackable: true, label: 'BX' },
    })
    const matching = mappingValue({
      mapping: { height: 'H', width: 'W', length: 'L' },
      units: { height: 'auto', width: 'cm', length: 'mm' },
      headerRow: 2,
      startRow: 4,
      dimensionMode: 'combined',
      combinedColumn: 'Size',
      dimensionOrder: ['width', 'height', 'length'],
      defaults: { label: 'BX', stackable: true, canRotate: false, quantity: 2 },
    })
    expect(sameImportMappingValue(left, matching)).toBe(true)

    expect(sameImportMappingValue(left, { ...matching, headerRow: 1 })).toBe(false)
    expect(sameImportMappingValue(left, { ...matching, startRow: 5 })).toBe(false)
    expect(sameImportMappingValue(left, { ...matching, dimensionMode: 'separate' })).toBe(false)
    expect(sameImportMappingValue(left, { ...matching, combinedColumn: 'Other' })).toBe(false)
    expect(sameImportMappingValue(left, {
      ...matching,
      dimensionOrder: ['length', 'width', 'height'],
    })).toBe(false)
    expect(sameImportMappingValue(left, {
      ...matching,
      units: { ...matching.units, width: 'mm' },
    })).toBe(false)
    expect(sameImportMappingValue(left, {
      ...matching,
      mapping: { ...matching.mapping, weight: 'Wt' },
    })).toBe(false)
    expect(sameImportMappingValue(left, {
      ...matching,
      defaults: { ...matching.defaults, quantity: 3 },
    })).toBe(false)
  })
})

