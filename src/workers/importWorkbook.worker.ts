import { ImportWorkbookBoundaryError, parseWorkbookBuffer } from '../lib/importWorkbookBoundary'

interface WorkbookWorkerScope {
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null
  postMessage(message: unknown): void
}

const workerScope = self as unknown as WorkbookWorkerScope

workerScope.onmessage = (event) => {
  try {
    workerScope.postMessage({ ok: true, rows: parseWorkbookBuffer(event.data) })
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      code: error instanceof ImportWorkbookBoundaryError ? 'limit' : 'parse',
    })
  }
}
