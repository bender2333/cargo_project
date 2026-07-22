import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteManagedUser,
  readManagedUsers,
  toggleManagedUserStatus,
} from '../api/users'
import type { ManagedUser } from '../api/users'
import { UserManagement } from './UserManagement'

vi.mock('../api/users', () => ({
  deleteManagedUser: vi.fn(),
  readManagedUsers: vi.fn(),
  toggleManagedUserStatus: vi.fn(),
}))

const mockedDelete = vi.mocked(deleteManagedUser)
const mockedRead = vi.mocked(readManagedUsers)
const mockedToggle = vi.mocked(toggleManagedUserStatus)

const activeUser: ManagedUser = {
  id: 'user-1',
  username: 'operator',
  role: 'user',
  disabled: false,
  createdAt: '2026-07-21T00:00:00.000Z',
  lastLoginAt: '2026-07-22T01:02:03.000Z',
  lastLoginIp: '127.0.0.1',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

beforeEach(() => {
  localStorage.clear()
  mockedDelete.mockReset()
  mockedRead.mockReset()
  mockedToggle.mockReset()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('UserManagement API boundary', () => {
  it('renders the frontend managed-user contract returned by the API module', async () => {
    mockedRead.mockResolvedValue([activeUser])

    const view = render(<UserManagement onBack={vi.fn()} />)

    expect(await view.findByText('operator')).toBeTruthy()
    expect(view.getByText('正常')).toBeTruthy()
    expect(view.getByText('127.0.0.1')).toBeTruthy()
    expect(mockedRead).toHaveBeenCalledTimes(1)
  })

  it('keeps a newer post-toggle list when an older refresh succeeds later', async () => {
    const toggle = deferred<void>()
    const staleRefresh = deferred<ManagedUser[]>()
    mockedRead
      .mockResolvedValueOnce([activeUser])
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce([{ ...activeUser, disabled: true }])
    mockedToggle.mockReturnValue(toggle.promise)

    const view = render(<UserManagement onBack={vi.fn()} />)
    await view.findByText('operator')
    fireEvent.click(view.getByRole('button', { name: '禁用' }))
    await waitFor(() => expect(mockedToggle).toHaveBeenCalledWith('user-1'))
    fireEvent.click(view.getByTestId('user-refresh-button'))
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(2))

    await act(async () => {
      toggle.resolve()
      await toggle.promise
    })
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(3))
    expect(await view.findByText('已禁用')).toBeTruthy()

    await act(async () => {
      staleRefresh.resolve([activeUser])
      await staleRefresh.promise
    })
    expect(view.getByText('已禁用')).toBeTruthy()
    expect(view.queryByText('正常')).toBeNull()
  })

  it('keeps a newer post-toggle success when an older refresh fails later', async () => {
    const toggle = deferred<void>()
    const staleRefresh = deferred<ManagedUser[]>()
    mockedRead
      .mockResolvedValueOnce([activeUser])
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce([{ ...activeUser, disabled: true }])
    mockedToggle.mockReturnValue(toggle.promise)

    const view = render(<UserManagement onBack={vi.fn()} />)
    await view.findByText('operator')
    fireEvent.click(view.getByRole('button', { name: '禁用' }))
    await waitFor(() => expect(mockedToggle).toHaveBeenCalledWith('user-1'))
    fireEvent.click(view.getByTestId('user-refresh-button'))
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(2))

    await act(async () => {
      toggle.resolve()
      await toggle.promise
    })
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(3))
    expect(await view.findByText('已禁用')).toBeTruthy()

    await act(async () => {
      staleRefresh.reject(new Error('stale request failed'))
      try {
        await staleRefresh.promise
      } catch {
        // The component owns the rejected request; this only flushes it through React.
      }
    })
    expect(view.queryByTestId('user-management-error')).toBeNull()
    expect(view.getByText('已禁用')).toBeTruthy()
  })

  it('keeps the existing English list fallback when the API has no server detail', async () => {
    localStorage.setItem('locale', 'en')
    mockedRead.mockRejectedValue(new Error('获取用户列表失败 (HTTP 503)'))

    const view = render(<UserManagement onBack={vi.fn()} />)

    expect(await view.findByText('Failed to fetch users (HTTP 503)')).toBeTruthy()
  })

  it('keeps the existing English mutation fallback in the notice and alert', async () => {
    localStorage.setItem('locale', 'en')
    const alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    mockedRead.mockResolvedValue([activeUser])
    mockedToggle.mockRejectedValue(new Error('操作失败'))

    const view = render(<UserManagement onBack={vi.fn()} />)
    await view.findByText('operator')
    fireEvent.click(view.getByRole('button', { name: 'Disable' }))

    await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Operation failed'))
    expect(view.getByTestId('user-management-error').textContent).toContain('Operation failed')
  })
})
