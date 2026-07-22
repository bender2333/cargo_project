import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../lib/auth'
import { login, register } from './auth'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('authentication API', () => {
  it('logs in with the public endpoint and returns the shared user contract', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      token: 'login-token',
      user: {
        id: 'user-1',
        username: 'operator',
        role: 'user',
      },
    }), { status: 200 }))

    const result = await login({ username: 'operator', password: 'secret-1' })
    const compatibleUser: User = result.user

    expect(result).toEqual({
      token: 'login-token',
      user: {
        id: 'user-1',
        username: 'operator',
        role: 'user',
      },
    })
    expect(compatibleUser).toEqual(result.user)
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'operator', password: 'secret-1' }),
    })
  })

  it('registers with the public endpoint and normalizes the success DTO', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      token: 'register-token',
      user: {
        id: 'user-2',
        username: 'planner',
        role: 'admin',
        created_at: '2026-07-22T00:00:00.000Z',
      },
    }), { status: 201 }))

    await expect(register({ username: 'planner', password: 'secret-2' })).resolves.toEqual({
      token: 'register-token',
      user: {
        id: 'user-2',
        username: 'planner',
        role: 'admin',
      },
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'planner', password: 'secret-2' }),
    })
  })

  it('preserves server authentication errors for the existing localized UI flow', async () => {
    localStorage.setItem('cargo_token', 'existing-session-token')
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'Invalid username or password',
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: 'Username already exists',
      }), { status: 409 }))

    await expect(login({ username: 'operator', password: 'wrong' }))
      .rejects.toThrow('Invalid username or password')
    await expect(register({ username: 'operator', password: 'secret-1' }))
      .rejects.toThrow('Username already exists')
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(localStorage.getItem('cargo_token')).toBe('existing-session-token')
  })

  it('distinguishes transport failures from server responses', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(login({ username: 'operator', password: 'secret-1' }))
      .rejects.toThrow('登录请求失败：Failed to fetch')
  })

  it('rejects invalid JSON with an error that identifies the response context', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }))
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }))

    await expect(register({ username: 'planner', password: 'secret-2' }))
      .rejects.toThrow('注册失败（HTTP 502）：服务器响应不是有效 JSON')
    await expect(login({ username: 'operator', password: 'secret-1' }))
      .rejects.toThrow('登录响应格式无效：服务器响应不是有效 JSON')
  })

  it.each([
    ['blank token', { token: '  ', user: { id: 'user-1', username: 'operator', role: 'user' } }],
    ['blank user id', { token: 'token', user: { id: '  ', username: 'operator', role: 'user' } }],
    ['blank username', { token: 'token', user: { id: 'user-1', username: '  ', role: 'user' } }],
    ['unsupported role', { token: 'token', user: { id: 'user-1', username: 'operator', role: 'owner' } }],
  ])('rejects a successful response with %s', async (_case, dto) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(dto), { status: 200 }))

    await expect(login({ username: 'operator', password: 'secret-1' }))
      .rejects.toThrow('登录响应格式无效')
  })
})
