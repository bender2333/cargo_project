import { describe, it, expect } from 'vitest'
import {
  canAutoMap,
  preSelectCol,
  translateImportIssue,
  buildImportMessages,
  importMappingValueFromTemplate,
  mappedColumnsForTemplateValue,
  missingMappedColumns,
  type ImportIssue,
} from './importWorkflow'
import type { ImportTemplate } from '../types'
import type { ImportMappingValue } from '../components/ImportMappingForm'

describe('canAutoMap', () => {
  it('returns false for array row', () => {
    expect(canAutoMap(['col1', 'col2'])).toBe(false)
  })

  it('returns true when all required fields match', () => {
    const row = {
      '长度': 1000,
      '宽度': 800,
      '高度': 600,
      '重量': 50,
      '数量': 10,
    }
    expect(canAutoMap(row)).toBe(true)
  })

  it('returns false when length is missing', () => {
    const row = {
      'width': 800,
      'height': 600,
      'weight': 50,
      'quantity': 10,
    }
    expect(canAutoMap(row)).toBe(false)
  })
})

describe('preSelectCol', () => {
  it('selects length column by Chinese header', () => {
    const columns = ['标签', '长度', '宽度', '重量']
    expect(preSelectCol('length', columns)).toBe('长度')
  })

  it('selects quantity by English header', () => {
    const columns = ['label', 'name', 'quantity', 'weight']
    expect(preSelectCol('quantity', columns)).toBe('quantity')
  })

  it('returns empty string when no match', () => {
    const columns = ['col1', 'col2']
    expect(preSelectCol('length', columns)).toBe('')
  })
})

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
