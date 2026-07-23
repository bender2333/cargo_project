import type { ImportCargoRow } from './importCargo'

export function importColumnsForHeaderRow(rows: ImportCargoRow[], headerRow: number): string[] {
  if (rows.some(Array.isArray)) {
    const header = rows[Math.max(0, headerRow - 1)]
    return Array.isArray(header)
      ? header.map((cell) => String(cell ?? '').trim()).filter(Boolean)
      : []
  }
  return Object.keys(rows[0] ?? {})
}

export function importPreviewRows(
  rows: ImportCargoRow[],
  headerRow: number,
  startRow: number,
): Array<Record<string, string | number | boolean | null | undefined>> {
  if (!rows.some(Array.isArray)) {
    return rows.filter((row): row is Record<string, string | number | boolean | null | undefined> => !Array.isArray(row))
  }

  const columns = importColumnsForHeaderRow(rows, headerRow)
  return rows.slice(Math.max(headerRow, startRow - 1)).filter(Array.isArray).map((row) => {
    const next: Record<string, string | number | boolean | null | undefined> = {}
    columns.forEach((column, index) => {
      next[column] = row[index]
    })
    return next
  })
}
