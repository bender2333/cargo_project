import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./Workbench', () => ({
  default: ({
    currentUser,
    onLogout,
  }: {
    currentUser: { id: string; username: string; role: 'user' | 'admin' } | null
    onLogout: () => void
  }) => (
    <section data-testid="mock-workbench" data-user-id={currentUser?.id ?? ''}>
      <span>{currentUser?.username ?? 'anonymous'}</span>
      <button type="button" onClick={onLogout}>Mock logout</button>
    </section>
  ),
}))

const user = { id: 'user-42', username: 'shell-user', role: 'admin' as const }

function tokenFor(payload = user) {
  return `header.${btoa(JSON.stringify(payload))}.signature`
}

function mockSuccessfulAuth(payload = user) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ token: tokenFor(payload) }),
  }))
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('App authentication shell', () => {
  it('switches between login and registration without mounting the workbench', () => {
    const view = render(<App />)

    fireEvent.click(view.getByRole('button', { name: '没有账号？立即注册' }))
    expect(view.getByRole('button', { name: '注册' })).toBeTruthy()
    expect(view.queryByTestId('mock-workbench')).toBeNull()

    fireEvent.click(view.getByRole('button', { name: '已有账号？立即登录' }))
    expect(view.getByRole('button', { name: '登录' })).toBeTruthy()
  })

  it('passes the token user to Workbench after login succeeds', async () => {
    mockSuccessfulAuth()
    const view = render(<App />)

    fireEvent.change(view.getByLabelText('用户名'), { target: { value: user.username } })
    fireEvent.change(view.getByLabelText('密码'), { target: { value: 'secret123' } })
    fireEvent.click(view.getByRole('button', { name: '登录' }))

    await waitFor(() => expect(view.getByTestId('mock-workbench').getAttribute('data-user-id')).toBe(user.id))
    expect(localStorage.getItem('cargo_token')).toBe(tokenFor())
  })

  it('passes the token user to Workbench after registration succeeds', async () => {
    mockSuccessfulAuth()
    const view = render(<App />)
    fireEvent.click(view.getByRole('button', { name: '没有账号？立即注册' }))

    fireEvent.change(view.getByLabelText('用户名'), { target: { value: user.username } })
    fireEvent.change(view.getByLabelText('密码'), { target: { value: 'secret123' } })
    fireEvent.change(view.getByLabelText('确认密码'), { target: { value: 'secret123' } })
    fireEvent.click(view.getByRole('button', { name: '注册' }))

    await waitFor(() => expect(view.getByTestId('mock-workbench').getAttribute('data-user-id')).toBe(user.id))
  })

  it('mounts Workbench immediately for an existing valid token', () => {
    localStorage.setItem('cargo_token', tokenFor())
    const view = render(<App />)

    expect(view.getByTestId('mock-workbench').getAttribute('data-user-id')).toBe(user.id)
    expect(view.getByText(user.username)).toBeTruthy()
  })

  it('preserves the existing token-based login behavior when the token payload is malformed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    localStorage.setItem('cargo_token', 'malformed-token')
    const view = render(<App />)

    expect(view.getByTestId('mock-workbench').getAttribute('data-user-id')).toBe('')
    expect(view.getByText('anonymous')).toBeTruthy()
  })

  it('clears the token and returns to login when Workbench requests logout', () => {
    localStorage.setItem('cargo_token', tokenFor())
    const view = render(<App />)

    fireEvent.click(view.getByRole('button', { name: 'Mock logout' }))

    expect(localStorage.getItem('cargo_token')).toBeNull()
    expect(view.getByRole('button', { name: '登录' })).toBeTruthy()
    expect(view.queryByTestId('mock-workbench')).toBeNull()
  })
})
