import { afterEach, describe, expect, it, vi } from 'vitest'
import { getToken, setToken } from '../lib/auth'
import { fetchWithAuth } from './client'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('authenticated API client', () => {
  it('preserves request options while enforcing session and JSON headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    setToken('session-token')

    await fetchWithAuth('/api/custom-cargo/cargo-1', {
      method: 'PUT',
      body: '{"name":"Updated"}',
      headers: {
        Authorization: 'Bearer caller-token',
        'Content-Type': 'text/plain',
        'X-Request-Id': 'request-42',
      },
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/custom-cargo/cargo-1', {
      method: 'PUT',
      body: '{"name":"Updated"}',
      headers: {
        Authorization: 'Bearer session-token',
        'Content-Type': 'application/json',
        'X-Request-Id': 'request-42',
      },
    })
  })

  it('binds the request header and 401 handling to the token used by that request', async () => {
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

  it('clears the current session when its own request receives 401', async () => {
    const location = { href: '' }
    vi.stubGlobal('window', { location })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))
    setToken('current-session-token')

    await fetchWithAuth('/api/history')

    expect(getToken()).toBeNull()
    expect(location.href).toBe('/login')
  })
})
