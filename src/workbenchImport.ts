import type { Locale } from './types'
import type { ImportCargoRow } from './lib/importCargo'
import {
  MAX_IMPORT_CELLS,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
} from './lib/importCargo'
import { importPreviewRows } from './lib/importTable'
import { ImportWorkbookWorkerError, parseWorkbookFileInWorker } from './lib/importWorkbookWorkerClient'
import { workbenchCopy as copy } from './data/workbenchCopy'

type ImportLabels = typeof copy.en

export type ImportExcelOutcome =
  | { kind: 'messages'; messages: string[] }
  | { kind: 'rows'; rows: ImportCargoRow[] }

export async function prepareExcelImport(args: {
  file: File
  locale: Locale
  t: ImportLabels
}): Promise<ImportExcelOutcome> {
  const { file, locale, t } = args
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { kind: 'messages', messages: [`${t.importIssue}: ${t.importFileTooLarge}`] }
  }
  let rows: ImportCargoRow[]
  try {
    rows = await parseWorkbookFileInWorker(file)
  } catch (error) {
    const workerError = error instanceof ImportWorkbookWorkerError ? error : null
    if (workerError?.code !== 'limit') console.error('[import-excel]', error)
    const detail = workerError?.code === 'limit'
      ? (locale === 'zh'
          ? `工作表展开后超过导入上限（最多 ${MAX_IMPORT_ROWS} 行、${MAX_IMPORT_COLUMNS} 列且 ${MAX_IMPORT_CELLS} 个单元格）`
          : `Expanded worksheet exceeds the import limit (${MAX_IMPORT_ROWS} rows, ${MAX_IMPORT_COLUMNS} columns, and ${MAX_IMPORT_CELLS} cells maximum)`)
      : workerError?.code === 'timeout'
        ? (locale === 'zh' ? '工作簿解析超时，已安全终止' : 'Workbook parsing timed out and was safely stopped')
        : t.importFileUnreadable
    return {
      kind: 'messages',
      messages: [`${workerError?.code === 'limit' ? t.importIssue : t.importParseFailed}: ${detail}`],
    }
  }

  if (rows.length === 0 || importPreviewRows(rows, 1, 2).length === 0) {
    return { kind: 'messages', messages: [`${t.importIssue}: ${t.importNoData}`] }
  }
  return { kind: 'rows', rows }
}
