import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, register } from './api/auth'
import App from './App'

vi.mock('./api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
}))

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
const mockedLogin = vi.mocked(login)
const mockedRegister = vi.mocked(register)

function tokenFor(payload = user) {
  return `header.${btoa(JSON.stringify(payload))}.signature`
}

beforeEach(() => {
  mockedLogin.mockReset()
  mockedRegister.mockReset()
})

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

  it('uses the authentication API and passes its user to Workbench after login succeeds', async () => {
    mockedLogin.mockResolvedValue({ token: 'opaque-login-token', user })
    const view = render(<App />)

    fireEvent.change(view.getByLabelText('用户名'), { target: { value: user.username } })
    fireEvent.change(view.getByLabelText('密码'), { target: { value: 'secret123' } })
    fireEvent.click(view.getByRole('button', { name: '登录' }))

    await waitFor(() => expect(view.getByTestId('mock-workbench').getAttribute('data-user-id')).toBe(user.id))
    expect(mockedLogin).toHaveBeenCalledWith({ username: user.username, password: 'secret123' })
    expect(localStorage.getItem('cargo_token')).toBe('opaque-login-token')
  })

  it('uses the authentication API and passes its user to Workbench after registration succeeds', async () => {
    mockedRegister.mockResolvedValue({ token: 'opaque-register-token', user })
    const view = render(<App />)
    fireEvent.click(view.getByRole('button', { name: '没有账号？立即注册' }))

    fireEvent.change(view.getByLabelText('用户名'), { target: { value: user.username } })
    fireEvent.change(view.getByLabelText('密码'), { target: { value: 'secret123' } })
    fireEvent.change(view.getByLabelText('确认密码'), { target: { value: 'secret123' } })
    fireEvent.click(view.getByRole('button', { name: '注册' }))

    await waitFor(() => expect(view.getByTestId('mock-workbench').getAttribute('data-user-id')).toBe(user.id))
    expect(mockedRegister).toHaveBeenCalledWith({ username: user.username, password: 'secret123' })
    expect(localStorage.getItem('cargo_token')).toBe('opaque-register-token')
  })

  it('keeps the existing localized login error message', async () => {
    mockedLogin.mockRejectedValue(new Error('Invalid username or password'))
    const view = render(<App />)

    fireEvent.change(view.getByLabelText('用户名'), { target: { value: user.username } })
    fireEvent.change(view.getByLabelText('密码'), { target: { value: 'wrong-password' } })
    fireEvent.click(view.getByRole('button', { name: '登录' }))

    expect(await view.findByText('用户名或密码错误')).toBeTruthy()
    expect(mockedLogin).toHaveBeenCalledWith({
      username: user.username,
      password: 'wrong-password',
    })
  })

  it('keeps the existing localized registration error message', async () => {
    mockedRegister.mockRejectedValue(new Error('Username already exists'))
    const view = render(<App />)
    fireEvent.click(view.getByRole('button', { name: '没有账号？立即注册' }))

    fireEvent.change(view.getByLabelText('用户名'), { target: { value: user.username } })
    fireEvent.change(view.getByLabelText('密码'), { target: { value: 'secret123' } })
    fireEvent.change(view.getByLabelText('确认密码'), { target: { value: 'secret123' } })
    fireEvent.click(view.getByRole('button', { name: '注册' }))

    expect(await view.findByText('用户名已被占用')).toBeTruthy()
  })

  it('preserves an unknown registration error message verbatim', async () => {
    mockedRegister.mockRejectedValue(new Error('Registration temporarily unavailable'))
    const view = render(<App />)
    fireEvent.click(view.getByRole('button', { name: '没有账号？立即注册' }))

    fireEvent.change(view.getByLabelText('用户名'), { target: { value: user.username } })
    fireEvent.change(view.getByLabelText('密码'), { target: { value: 'secret123' } })
    fireEvent.change(view.getByLabelText('确认密码'), { target: { value: 'secret123' } })
    fireEvent.click(view.getByRole('button', { name: '注册' }))

    expect(await view.findByText('Registration temporarily unavailable')).toBeTruthy()
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
