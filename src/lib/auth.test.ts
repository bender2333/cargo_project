import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth, getToken, setToken } from './auth'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('fetchWithAuth session isolation', () => {
  it('does not clear a newer session when an older request resolves with 401', async () => {
    let resolveResponse: ((response: Response) => void) | undefined
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const fetchMock = vi.fn().mockReturnValue(pendingResponse)
    vi.stubGlobal('fetch', fetchMock)

    setToken('old-session-token')
    const request = fetchWithAuth('/api/history')
    setToken('new-session-token')
    resolveResponse?.(new Response(null, { status: 401 }))

    await request

    expect(fetchMock).toHaveBeenCalledWith('/api/history', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer old-session-token' }),
    }))
    expect(getToken()).toBe('new-session-token')
  })
})
