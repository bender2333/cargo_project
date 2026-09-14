import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseWorkbookFileInWorker, type ImportWorkbookWorkerLike } from './importWorkbookWorkerClient'

class FakeWorker implements ImportWorkbookWorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  terminated = false
  posted = false
  terminationCount = 0
  postedBuffer: ArrayBuffer | null = null
  postedTransfer: Transferable[] = []
  postError: Error | null = null

  postMessage(message: ArrayBuffer, transfer: Transferable[]) {
    this.posted = true
    this.postedBuffer = message
    this.postedTransfer = transfer
    if (this.postError) throw this.postError
  }
  terminate() {
    this.terminationCount += 1
    this.terminated = true
  }
}

afterEach(() => vi.useRealTimers())


const workbookFile = { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(4)) } as unknown as File
describe('parseWorkbookFileInWorker', () => {
  it('terminates a worker that exceeds the bounded parse timeout', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const parsing = parseWorkbookFileInWorker(workbookFile, {
      createWorker: () => worker,
      timeoutMs: 50,
    })
    const rejection = expect(parsing).rejects.toMatchObject({ code: 'timeout' })

    await vi.advanceTimersByTimeAsync(50)

    await rejection
    expect(worker.posted).toBe(true)
    expect(worker.terminated).toBe(true)
  })

  it('ignores late worker events after timeout and terminates exactly once', async () => {
    vi.useFakeTimers()
    const worker = new FakeWorker()
    const parsing = parseWorkbookFileInWorker(workbookFile, {
      createWorker: () => worker,
      timeoutMs: 50,
    })
    const rejection = expect(parsing).rejects.toMatchObject({ code: 'timeout' })

    await vi.advanceTimersByTimeAsync(50)
    await rejection
    worker.onmessage?.(new MessageEvent('message', { data: { ok: true, rows: [['late']] } }))
    worker.onerror?.(new ErrorEvent('error'))

    expect(worker.terminationCount).toBe(1)
  })

  it('terminates and exposes worker parse errors without a main-thread fallback', async () => {
    const worker = new FakeWorker()
    const parsing = parseWorkbookFileInWorker(workbookFile, {
      createWorker: () => worker,
    })
    await vi.waitFor(() => expect(worker.posted).toBe(true))

    worker.onerror?.(new ErrorEvent('error', { message: 'worker failed' }))

    await expect(parsing).rejects.toMatchObject({ code: 'parse' })
    expect(worker.terminated).toBe(true)
  })

  it('surfaces an explicit worker limit failure and terminates the worker', async () => {
    const worker = new FakeWorker()
    const parsing = parseWorkbookFileInWorker(workbookFile, { createWorker: () => worker })
    await vi.waitFor(() => expect(worker.posted).toBe(true))

    worker.onmessage?.(new MessageEvent('message', { data: { ok: false, code: 'limit' } }))

    await expect(parsing).rejects.toMatchObject({ code: 'limit' })
    expect(worker.terminated).toBe(true)
  })

  it('rejects malformed worker responses instead of leaving the import pending', async () => {
    const worker = new FakeWorker()
    const parsing = parseWorkbookFileInWorker(workbookFile, { createWorker: () => worker })
    await vi.waitFor(() => expect(worker.posted).toBe(true))

    worker.onmessage?.(new MessageEvent('message', { data: { ok: 'yes', rows: [] } }))

    await expect(parsing).rejects.toMatchObject({ code: 'parse' })
    expect(worker.terminated).toBe(true)
  })

  it('rejects mixed row shapes and payloads beyond the import bounds', async () => {
    const mixedWorker = new FakeWorker()
    const mixedParsing = parseWorkbookFileInWorker(workbookFile, { createWorker: () => mixedWorker })
    await vi.waitFor(() => expect(mixedWorker.posted).toBe(true))
    mixedWorker.onmessage?.(new MessageEvent('message', { data: { ok: true, rows: [['Label'], { Label: 'A' }] } }))
    await expect(mixedParsing).rejects.toMatchObject({ code: 'parse' })

    const oversizedWorker = new FakeWorker()
    const oversizedParsing = parseWorkbookFileInWorker(workbookFile, { createWorker: () => oversizedWorker })
    await vi.waitFor(() => expect(oversizedWorker.posted).toBe(true))
    oversizedWorker.onmessage?.(new MessageEvent('message', {
      data: { ok: true, rows: [Array.from({ length: 200_001 }, () => 'x')] },
    }))
    await expect(oversizedParsing).rejects.toMatchObject({ code: 'parse' })
  })

  it('normalizes synchronous postMessage failures and terminates exactly once', async () => {
    const worker = new FakeWorker()
    worker.postError = new Error('post failed')

    await expect(parseWorkbookFileInWorker(workbookFile, { createWorker: () => worker })).rejects.toMatchObject({ code: 'parse' })
    expect(worker.terminated).toBe(true)
  })

  it('returns bounded rows and terminates after a successful worker response', async () => {
    const worker = new FakeWorker()
    const parsing = parseWorkbookFileInWorker(workbookFile, {
      createWorker: () => worker,
    })
    await vi.waitFor(() => expect(worker.posted).toBe(true))

    worker.onmessage?.(new MessageEvent('message', { data: { ok: true, rows: [['Label'], ['A']] } }))

    await expect(parsing).resolves.toEqual([['Label'], ['A']])
    expect(worker.postedBuffer).toBeInstanceOf(ArrayBuffer)
    expect(worker.postedTransfer).toHaveLength(1)
    expect(worker.terminated).toBe(true)
  })
})
