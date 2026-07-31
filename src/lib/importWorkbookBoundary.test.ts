import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { ImportWorkbookBoundaryError, parseWorkbookBuffer, validateWorksheetBounds } from './importWorkbookBoundary'

describe('importWorkbookBoundary', () => {
  it('rejects worksheets wider than the deterministic column cap', () => {
    expect(() => validateWorksheetBounds({ '!ref': 'A1:IW2' })).toThrowError(ImportWorkbookBoundaryError)
  })

  it('validates the original full range before a truncated worker range', () => {
    expect(() => validateWorksheetBounds({ '!ref': 'A1:A100', '!fullref': 'A1:A10001' })).toThrowError(ImportWorkbookBoundaryError)
  })

  it('rejects row overflow when a worksheet format does not expose fullref', () => {
    expect(() => validateWorksheetBounds({ '!ref': 'A1:A10001' })).toThrowError(ImportWorkbookBoundaryError)
  })

  it('rejects a serialized workbook whose expanded row-column product exceeds the cell cap', () => {
    const rows = Array.from({ length: 1_001 }, () => Array.from({ length: 201 }, () => 'x'))
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Expanded')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    expect(() => parseWorkbookBuffer(buffer)).toThrowError(ImportWorkbookBoundaryError)
  })


  it('rejects a ten-thousand-row range whose absolute end exceeds the worker row sentinel', () => {
    const sheet = XLSX.utils.aoa_to_sheet([])
    sheet['A50'] = { v: 'Header', t: 's' }
    sheet['A10049'] = { v: 'Last row', t: 's' }
    sheet['!ref'] = 'A50:A10049'
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'Leading blanks')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    expect(() => parseWorkbookBuffer(buffer)).toThrowError(ImportWorkbookBoundaryError)
  })

  it('allows a full ten-thousand-row range starting on row two', () => {
    expect(() => validateWorksheetBounds({ '!fullref': 'A2:A10001' })).not.toThrow()
  })
  it('parses only the first worksheet when later sheets are oversized', () => {
    const first = XLSX.utils.aoa_to_sheet([
      ['Label', 'Name', 'Length', 'Width', 'Height', 'Weight', 'Quantity'],
      ['A', 'First sheet cargo', 1000, 800, 600, 25, 1],
    ])
    const oversizedSecond = XLSX.utils.aoa_to_sheet([
      Array.from({ length: 257 }, (_, index) => `Column ${index + 1}`),
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, first, 'Cargo')
    XLSX.utils.book_append_sheet(workbook, oversizedSecond, 'Oversized ignored sheet')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const rows = parseWorkbookBuffer(buffer)

    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual(['A', 'First sheet cargo', 1000, 800, 600, 25, 1])
  })
})
