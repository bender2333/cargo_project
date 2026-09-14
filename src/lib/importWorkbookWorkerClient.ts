import { importWorksheetSizeWithinLimits, type ImportCargoRow } from './importCargo'

export type ImportWorkbookWorkerErrorCode = 'limit' | 'parse' | 'timeout'

type WorkerSuccess = { ok: true; rows: ImportCargoRow[] }
type WorkerFailure = { ok: false; code: 'limit' | 'parse' }
type WorkerResponse = WorkerSuccess | WorkerFailure

function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const response = value as { ok?: unknown; code?: unknown; rows?: unknown }
  if (response.ok === false) return response.code === 'limit' || response.code === 'parse'
  if (response.ok !== true || !Array.isArray(response.rows)) return false
  if (!response.rows.every((row) => Array.isArray(row))) return false
  const rows = response.rows as unknown[][]
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0)
  return importWorksheetSizeWithinLimits(rows.length, columnCount)
}

export type ImportWorkbookWorkerLike = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: ArrayBuffer, transfer: Transferable[]): void
  terminate(): void
}

type ParseWorkbookWorkerOptions = {
  createWorker?: () => ImportWorkbookWorkerLike
  timeoutMs?: number
}

const DEFAULT_IMPORT_WORKER_TIMEOUT_MS = 10_000

export class ImportWorkbookWorkerError extends Error {
  readonly code: ImportWorkbookWorkerErrorCode

  constructor(code: ImportWorkbookWorkerErrorCode) {
    super(`Workbook worker failed: ${code}`)
    this.name = 'ImportWorkbookWorkerError'
    this.code = code
  }
}

function createImportWorkbookWorker(): ImportWorkbookWorkerLike {
  return new Worker(new URL('../workers/importWorkbook.worker.ts', import.meta.url), { type: 'module' })
}

export async function parseWorkbookFileInWorker(
  file: File,
  options: ParseWorkbookWorkerOptions = {},
): Promise<ImportCargoRow[]> {
  const buffer = await file.arrayBuffer()
  const worker = (options.createWorker ?? createImportWorkbookWorker)()
  const timeoutMs = options.timeoutMs ?? DEFAULT_IMPORT_WORKER_TIMEOUT_MS

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (result: WorkerResponse | ImportWorkbookWorkerError) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      worker.terminate()
      if (result instanceof ImportWorkbookWorkerError) {
        reject(result)
      } else if (result.ok) {
        resolve(result.rows)
      } else {
        reject(new ImportWorkbookWorkerError(result.code))
      }
    }
    const timeoutId = window.setTimeout(() => finish(new ImportWorkbookWorkerError('timeout')), timeoutMs)
    worker.onmessage = (event) => {
      finish(isWorkerResponse(event.data)
        ? event.data
        : new ImportWorkbookWorkerError('parse'))
    }
    worker.onerror = () => finish(new ImportWorkbookWorkerError('parse'))
    try {
      worker.postMessage(buffer, [buffer])
    } catch {
      finish(new ImportWorkbookWorkerError('parse'))
    }
  })
}
