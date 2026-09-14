import { StrictMode } from 'react'
import type { ComponentType } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, register } from './api/auth'
import type { User } from './lib/auth'
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

type WorkbenchTestProps = {
  currentUser: User | null
  onLogout: () => void
}

type WorkbenchTestLoader = () => Promise<{ default: ComponentType<WorkbenchTestProps> }>

function tokenFor(payload = user) {
  return `header.${btoa(JSON.stringify(payload))}.signature`
}
function preventExpectedChunkLoadError(event: ErrorEvent) {
  if (event.error?.message === 'chunk unavailable') event.preventDefault()
}


beforeEach(() => {
  mockedLogin.mockReset()
  window.addEventListener('error', preventExpectedChunkLoadError)
  mockedRegister.mockReset()
})

afterEach(() => {
  cleanup()
  window.removeEventListener('error', preventExpectedChunkLoadError)
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
  it('starts the Workbench loader while login is visible and reuses its pending promise after login', async () => {
    const PreloadedWorkbench = () => <section data-testid="preloaded-workbench">Preloaded workbench</section>
    let resolveWorkbench!: (module: { default: typeof PreloadedWorkbench }) => void
    const workbenchImport = new Promise<{ default: typeof PreloadedWorkbench }>((resolve) => {
      resolveWorkbench = resolve
    })
    const loadWorkbench = vi.fn<WorkbenchTestLoader>().mockReturnValue(workbenchImport)
    const view = render(
      <StrictMode>
        <App loadWorkbench={loadWorkbench} />
      </StrictMode>,
    )

    expect(view.getByRole('button', { name: '登录' })).toBeTruthy()
    await waitFor(() => expect(loadWorkbench).toHaveBeenCalledTimes(1))
    expect(view.getByRole('button', { name: '登录' })).toBeTruthy()

    mockedLogin.mockResolvedValue({ token: 'preloaded-login-token', user })
    fireEvent.change(view.getByLabelText('用户名'), { target: { value: user.username } })
    fireEvent.change(view.getByLabelText('密码'), { target: { value: 'secret123' } })
    fireEvent.click(view.getByRole('button', { name: '登录' }))
    await waitFor(() => expect(mockedLogin).toHaveBeenCalledWith({ username: user.username, password: 'secret123' }))

    resolveWorkbench({ default: PreloadedWorkbench })
    expect(await view.findByTestId('preloaded-workbench')).toBeTruthy()
    expect(loadWorkbench).toHaveBeenCalledTimes(1)
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

  it('mounts Workbench immediately for an existing valid token', async () => {
    localStorage.setItem('cargo_token', tokenFor())
    const view = render(<App />)

    expect((await view.findByTestId('mock-workbench')).getAttribute('data-user-id')).toBe(user.id)
    expect(await view.findByText(user.username)).toBeTruthy()
  })

  it('preserves the existing token-based login behavior when the token payload is malformed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    localStorage.setItem('cargo_token', 'malformed-token')
    const view = render(<App />)

    expect((await view.findByTestId('mock-workbench')).getAttribute('data-user-id')).toBe('')
    expect(await view.findByText('anonymous')).toBeTruthy()
  })

  it('clears the token and returns to login when Workbench requests logout', async () => {
    localStorage.setItem('cargo_token', tokenFor())
    const view = render(<App />)

    fireEvent.click(await view.findByRole('button', { name: 'Mock logout' }))

    expect(localStorage.getItem('cargo_token')).toBeNull()
    expect(view.getByRole('button', { name: '登录' })).toBeTruthy()
    expect(view.queryByTestId('mock-workbench')).toBeNull()
  })
  it('creates a fresh Workbench loader after a rejected chunk is retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    localStorage.setItem('cargo_token', tokenFor())
    const RecoveredWorkbench = () => <section data-testid="retried-workbench">Recovered workbench</section>
    let resolveRetry!: (module: { default: typeof RecoveredWorkbench }) => void
    const retryAttempt = new Promise<{ default: typeof RecoveredWorkbench }>((resolve) => {
      resolveRetry = resolve
    })
    const loadWorkbench = vi.fn<WorkbenchTestLoader>()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockReturnValueOnce(retryAttempt)

    const view = render(
      <StrictMode>
        <App loadWorkbench={loadWorkbench} />
      </StrictMode>,
    )

    await waitFor(() => expect(loadWorkbench).toHaveBeenCalledTimes(1))
    expect(await view.findByTestId('workbench-load-error')).toBeTruthy()

    fireEvent.click(view.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(loadWorkbench).toHaveBeenCalledTimes(2))
    resolveRetry({ default: RecoveredWorkbench })
    expect(await view.findByTestId('retried-workbench')).toBeTruthy()
  })

  it('creates a fresh Workbench loader after logging out from a rejected chunk', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    localStorage.setItem('cargo_token', tokenFor())
    mockedLogin.mockResolvedValue({ token: 'fresh-login-token', user })
    const RecoveredWorkbench = () => <section data-testid="logout-recovered-workbench">Recovered after logout</section>
    let resolveLogin!: (module: { default: typeof RecoveredWorkbench }) => void
    const loginAttempt = new Promise<{ default: typeof RecoveredWorkbench }>((resolve) => {
      resolveLogin = resolve
    })
    const loadWorkbench = vi.fn<WorkbenchTestLoader>()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockReturnValueOnce(loginAttempt)
    const view = render(<App loadWorkbench={loadWorkbench} />)

    expect(await view.findByTestId('workbench-load-error')).toBeTruthy()
    expect(loadWorkbench).toHaveBeenCalledTimes(1)
    fireEvent.click(view.getByRole('button', { name: '退出登录' }))

    fireEvent.change(view.getByLabelText('用户名'), { target: { value: user.username } })
    fireEvent.change(view.getByLabelText('密码'), { target: { value: 'secret123' } })
    fireEvent.click(view.getByRole('button', { name: '登录' }))

    await waitFor(() => expect(loadWorkbench).toHaveBeenCalledTimes(2))
    resolveLogin({ default: RecoveredWorkbench })
    expect(await view.findByTestId('logout-recovered-workbench')).toBeTruthy()
  })

})
