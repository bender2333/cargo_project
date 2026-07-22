import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithAuth } from './client'
import {
  deleteManagedUser,
  readManagedUsers,
  toggleManagedUserStatus,
} from './users'
import type { ManagedUser } from './users'

vi.mock('./client', () => ({
  fetchWithAuth: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchWithAuth)

const dto = {
  id: 'user-1',
  username: 'operator',
  role: 'user',
  disabled: 0,
  created_at: '2026-07-21T00:00:00.000Z',
  last_login_at: '2026-07-22T01:02:03.000Z',
  last_login_ip: '127.0.0.1',
} as const

const managedUser: ManagedUser = {
  id: 'user-1',
  username: 'operator',
  role: 'user',
  disabled: false,
  createdAt: '2026-07-21T00:00:00.000Z',
  lastLoginAt: '2026-07-22T01:02:03.000Z',
  lastLoginIp: '127.0.0.1',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

describe('managed users API', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('maps complete backend user DTOs into the frontend user contract', async () => {
    mockedFetch.mockResolvedValue(jsonResponse([
      dto,
      {
        ...dto,
        id: 'admin-user',
        username: 'admin',
        role: 'admin',
        disabled: 1,
        last_login_at: null,
        last_login_ip: null,
      },
    ]))

    await expect(readManagedUsers()).resolves.toEqual([
      managedUser,
      {
        id: 'admin-user',
        username: 'admin',
        role: 'admin',
        disabled: true,
        createdAt: '2026-07-21T00:00:00.000Z',
        lastLoginAt: null,
        lastLoginIp: null,
      },
    ])
    expect(mockedFetch).toHaveBeenCalledWith('/api/users')
  })

  it('toggles and deletes by id through the existing admin endpoints', async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse({
        message: 'User status updated successfully',
        disabled: true,
      }))
      .mockResolvedValueOnce(jsonResponse({
        message: 'User deleted successfully',
      }))

    await expect(toggleManagedUserStatus('user-1')).resolves.toBeUndefined()
    await expect(deleteManagedUser('user-1')).resolves.toBeUndefined()

    expect(mockedFetch).toHaveBeenNthCalledWith(1, '/api/users/user-1/toggle-status', {
      method: 'PUT',
    })
    expect(mockedFetch).toHaveBeenNthCalledWith(2, '/api/users/user-1', {
      method: 'DELETE',
    })
  })

  it.each([
    ['list', () => readManagedUsers()],
    ['toggle', () => toggleManagedUserStatus('user-1')],
    ['delete', () => deleteManagedUser('user-1')],
  ])('rejects %s network failures without presenting success', async (_operation, request) => {
    const networkError = new TypeError('Failed to fetch')
    mockedFetch.mockRejectedValue(networkError)

    await expect(request()).rejects.toBe(networkError)
  })

  it('prefers nonblank backend errors and otherwise uses stable operation fallbacks', async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse({ error: 'Database unavailable' }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: 'Cannot disable the default admin' }, 400))
      .mockResolvedValueOnce(jsonResponse({ error: '   ' }, 404))

    await expect(readManagedUsers()).rejects.toThrow('Database unavailable')
    await expect(toggleManagedUserStatus('admin-user')).rejects.toThrow('Cannot disable the default admin')
    await expect(deleteManagedUser('missing')).rejects.toThrow('操作失败')
  })

  it.each([
    ['list', () => readManagedUsers(), '获取用户列表响应格式无效：服务器响应不是有效 JSON'],
    ['toggle', () => toggleManagedUserStatus('user-1'), '操作响应格式无效：服务器响应不是有效 JSON'],
    ['delete', () => deleteManagedUser('user-1'), '操作响应格式无效：服务器响应不是有效 JSON'],
  ])('rejects invalid JSON from a successful %s response', async (_operation, request, message) => {
    mockedFetch.mockResolvedValue(new Response('not-json', { status: 200 }))

    await expect(request()).rejects.toThrow(message)
  })

  it('uses the list fallback when a failed response is not JSON', async () => {
    mockedFetch.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))

    await expect(readManagedUsers()).rejects.toThrow('获取用户列表失败 (HTTP 502)')
  })

  it('rejects a successful list response that is not an array', async () => {
    mockedFetch.mockResolvedValue(jsonResponse({ users: [dto] }))

    await expect(readManagedUsers()).rejects.toThrow('获取用户列表响应格式无效')
  })

  it.each([
    ['blank id', { ...dto, id: '  ' }],
    ['blank username', { ...dto, username: '' }],
    ['unsupported role', { ...dto, role: 'owner' }],
    ['non-binary disabled flag', { ...dto, disabled: 2 }],
    ['missing creation time', { ...dto, created_at: undefined }],
    ['invalid last login time', { ...dto, last_login_at: 42 }],
    ['invalid last login IP', { ...dto, last_login_ip: false }],
  ])('rejects a user DTO with %s', async (_case, invalidDto) => {
    mockedFetch.mockResolvedValue(jsonResponse([invalidDto]))

    await expect(readManagedUsers()).rejects.toThrow('获取用户列表响应格式无效')
  })

  it('rejects malformed mutation success DTOs instead of reporting success', async () => {
    mockedFetch
      .mockResolvedValueOnce(jsonResponse({
        message: 'User status updated successfully',
        disabled: 1,
      }))
      .mockResolvedValueOnce(jsonResponse({
        message: '',
      }))

    await expect(toggleManagedUserStatus('user-1')).rejects.toThrow('操作响应格式无效')
    await expect(deleteManagedUser('user-1')).rejects.toThrow('操作响应格式无效')
  })
})
