import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { LoginPage } from './components/LoginPage'
import { RegisterPage } from './components/RegisterPage'
import { getCurrentUser, getToken, removeToken } from './lib/auth'
import type { User } from './lib/auth'

const Workbench = lazy(async () => {
  const module = await import('./Workbench')
  return { default: module.default }
})

function WorkbenchFallback({ locale }: { locale: 'zh' | 'en' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb] text-sm text-slate-600" data-testid="workbench-loading">
      {locale === 'zh' ? '工作台加载中…' : 'Loading workspace…'}
    </div>
  )
}

function WorkbenchLoadError({
  locale,
  onRetry,
  onLogout,
}: {
  locale: 'zh' | 'en'
  onRetry: () => void
  onLogout: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f4f7fb] px-4 text-center" data-testid="workbench-load-error">
      <p className="text-sm font-semibold text-red-700">
        {locale === 'zh' ? '工作台加载失败' : 'Failed to load workspace'}
      </p>
      <div className="flex gap-2">
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={onRetry}>
          {locale === 'zh' ? '重试' : 'Retry'}
        </button>
        <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700" type="button" onClick={onLogout}>
          {locale === 'zh' ? '退出登录' : 'Log out'}
        </button>
      </div>
    </div>
  )
}

class WorkbenchErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export default function App() {
  const [session, setSession] = useState<User | null | false>(() => (getToken() ? getCurrentUser() : false))
  const [showRegister, setShowRegister] = useState(false)
  const [workbenchLoadKey, setWorkbenchLoadKey] = useState(0)
  const [workbenchFailed, setWorkbenchFailed] = useState(false)
  const locale = (typeof window !== 'undefined' && window.localStorage.getItem('locale') === 'en') ? 'en' : 'zh'

  const handleAuthSuccess = (user: User) => {
    setWorkbenchFailed(false)
    setSession(user)
  }

  const handleLogout = () => {
    removeToken()
    setSession(false)
    setShowRegister(false)
    setWorkbenchFailed(false)
  }

  if (session === false) {
    return showRegister ? (
      <RegisterPage
        onRegisterSuccess={handleAuthSuccess}
        onToggleLogin={() => setShowRegister(false)}
      />
    ) : (
      <LoginPage
        onLoginSuccess={handleAuthSuccess}
        onToggleRegister={() => setShowRegister(true)}
      />
    )
  }

  if (workbenchFailed) {
    return (
      <WorkbenchLoadError
        locale={locale}
        onRetry={() => {
          setWorkbenchFailed(false)
          setWorkbenchLoadKey((value) => value + 1)
        }}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <Suspense fallback={<WorkbenchFallback locale={locale} />}>
      <WorkbenchErrorBoundary
        key={workbenchLoadKey}
        onError={() => setWorkbenchFailed(true)}
      >
        <Workbench currentUser={session} onLogout={handleLogout} />
      </WorkbenchErrorBoundary>
    </Suspense>
  )
}
