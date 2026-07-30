import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readManagedUsers } from '../api/users'
import type { ManagedUser } from '../api/users'
import { UserManagement } from './UserManagement'

vi.mock('../api/users', () => ({
  readManagedUsers: vi.fn(),
}))

const mockedRead = vi.mocked(readManagedUsers)

const activeUser: ManagedUser = {
  id: 'user-1',
  username: 'operator',
  role: 'user',
  disabled: false,
  createdAt: '2026-07-21T00:00:00.000Z',
  lastLoginAt: '2026-07-22T01:02:03.000Z',
  lastLoginIp: '127.0.0.1',
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('locale', 'en')
  mockedRead.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('UserManagement audit-only boundary', () => {
  it('loads audit fields and never exposes disable/delete actions', async () => {
    mockedRead.mockResolvedValue([activeUser])
    const view = render(<UserManagement onBack={vi.fn()} />)

    expect(await view.findByText('operator')).toBeTruthy()
    expect(view.getByText('127.0.0.1')).toBeTruthy()
    expect(view.getByText('Active')).toBeTruthy()
    expect(view.queryByRole('button', { name: 'Disable' })).toBeNull()
    expect(view.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(view.queryByRole('button', { name: 'Enable' })).toBeNull()
  })


  it('surfaces list failures without claiming success', async () => {
    mockedRead.mockRejectedValue(new Error('获取用户列表失败 (HTTP 500)'))
    const view = render(<UserManagement onBack={vi.fn()} />)

    await waitFor(() => {
      expect(view.getByTestId('user-management-error').textContent).toMatch(/Failed to fetch users|获取用户列表失败/)
    })
  })

  it('filters the audit list by username search', async () => {
    mockedRead.mockResolvedValue([
      activeUser,
      { ...activeUser, id: 'user-2', username: 'planner', lastLoginIp: '10.0.0.2' },
    ])
    const view = render(<UserManagement onBack={vi.fn()} />)
    await view.findByText('operator')

    fireEvent.change(view.getByTestId('user-search-input'), { target: { value: 'plan' } })
    expect(view.getByText('planner')).toBeTruthy()
    expect(view.queryByText('operator')).toBeNull()
  })
})
