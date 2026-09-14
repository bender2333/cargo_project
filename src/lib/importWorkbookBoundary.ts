import * as XLSXModule from 'xlsx'
import {
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  importWorksheetSizeWithinLimits,
  type ImportCargoRow,
} from './importCargo'
const XLSX = 't' in XLSXModule
  ? (XLSXModule as typeof XLSXModule & { t: typeof XLSXModule }).t
  : XLSXModule
type WorksheetBounds = {
  '!ref'?: string
  '!fullref'?: string
}

export class ImportWorkbookBoundaryError extends Error {
  constructor() {
    super('Expanded worksheet exceeds the import boundary')
    this.name = 'ImportWorkbookBoundaryError'
  }
}

export function validateWorksheetBounds(sheet: WorksheetBounds): void {
  const rangeReference = sheet['!fullref'] ?? sheet['!ref']
  if (!rangeReference) return
  const range = XLSX.utils.decode_range(rangeReference)
  const rowCount = range.e.r - range.s.r + 1
  const columnCount = range.e.c - range.s.c + 1
  const hasFullReference = sheet['!fullref'] !== undefined
  const absoluteEndExceedsLimit = range.e.r > MAX_IMPORT_ROWS
  const reachesAbsoluteRowSentinel = !hasFullReference && range.s.r > 0 && range.e.r >= MAX_IMPORT_ROWS && rowCount < MAX_IMPORT_ROWS
  if (!importWorksheetSizeWithinLimits(rowCount, columnCount) || absoluteEndExceedsLimit || reachesAbsoluteRowSentinel) {
    throw new ImportWorkbookBoundaryError()
  }
}

export function parseWorkbookBuffer(buffer: ArrayBuffer): ImportCargoRow[] {
  const workbook = XLSX.read(buffer, {
    type: 'array',
    sheets: 0,
    sheetRows: MAX_IMPORT_ROWS + 1,
  })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []

  validateWorksheetBounds(sheet)
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true }) as ImportCargoRow[]
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : Object.keys(row).length), 0)
  if (!importWorksheetSizeWithinLimits(rows.length, columnCount) || columnCount > MAX_IMPORT_COLUMNS) {
    throw new ImportWorkbookBoundaryError()
  }
  return rows
}
