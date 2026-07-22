import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from './client'
import { readRecentServerLogs } from './debugLogs'

vi.mock('./client', () => ({
  fetchWithAuth: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchWithAuth)

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

const dto = {
  path: '/var/log/cargo-server.log',
  count: 2,
  lines: ['first line', 'second line'],
}

describe('debug logs API', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('returns validated log lines from the existing admin endpoint', async () => {
    mockedFetch.mockResolvedValue(jsonResponse(dto))

    await expect(readRecentServerLogs()).resolves.toEqual(dto.lines)
    expect(mockedFetch).toHaveBeenCalledWith('/api/_debug/recent-logs?limit=120')
  })

  it('preserves transport failures', async () => {
    const networkError = new TypeError('Failed to fetch')
    mockedFetch.mockRejectedValue(networkError)

    await expect(readRecentServerLogs()).rejects.toBe(networkError)
  })

  it('keeps the existing HTTP status error for non-success responses', async () => {
    mockedFetch.mockResolvedValue(jsonResponse({ error: 'Failed to read log' }, 500))

    await expect(readRecentServerLogs()).rejects.toThrow('HTTP 500')
  })

  it('rejects invalid JSON from a successful response', async () => {
    mockedFetch.mockResolvedValue(new Response('not-json', { status: 200 }))

    await expect(readRecentServerLogs())
      .rejects.toThrow('服务器日志响应格式无效：服务器响应不是有效 JSON')
  })

  it.each([
    ['a non-object response', dto.lines],
    ['a blank path', { ...dto, path: '  ' }],
    ['a non-integer count', { ...dto, count: 2.5 }],
    ['a count that disagrees with lines', { ...dto, count: 1 }],
    ['a non-array lines value', { ...dto, lines: 'first line' }],
    ['a non-string line', { ...dto, lines: ['first line', 2] }],
  ])('rejects %s', async (_case, body) => {
    mockedFetch.mockResolvedValue(jsonResponse(body))

    await expect(readRecentServerLogs()).rejects.toThrow('服务器日志响应格式无效')
  })
})
