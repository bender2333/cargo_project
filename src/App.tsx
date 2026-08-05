import { Component, lazy, Suspense, useEffect, useState } from 'react'
import type { ComponentType, LazyExoticComponent, ReactNode } from 'react'
import { LoginPage } from './components/LoginPage'
import { RegisterPage } from './components/RegisterPage'
import { getCurrentUser, getToken, removeToken } from './lib/auth'
import type { User } from './lib/auth'

type WorkbenchProps = {
  currentUser: User | null
  onLogout: () => void
}

type WorkbenchModule = { default: ComponentType<WorkbenchProps> }

type WorkbenchLoader = () => Promise<WorkbenchModule>

// Keep Workbench in a separate deployment chunk; a static import would defeat lazy loading.
const loadWorkbench: WorkbenchLoader = () => import('./Workbench')

type WorkbenchAttempt = {
  Component: LazyExoticComponent<ComponentType<WorkbenchProps>>
  load: () => Promise<WorkbenchModule>
}

function createWorkbenchAttempt(loader: WorkbenchLoader): WorkbenchAttempt {
  let promise: Promise<WorkbenchModule> | null = null
  const load = () => {
    if (!promise) {
      try {
        promise = loader()
      } catch (error) {
        promise = Promise.reject(error)
      }
      void promise.catch(() => undefined)
    }
    return promise
  }
  return { Component: lazy(load), load }
}


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

export default function App({ loadWorkbench: loader = loadWorkbench }: { loadWorkbench?: WorkbenchLoader }) {
  const [session, setSession] = useState<User | null | false>(() => (getToken() ? getCurrentUser() : false))
  const [showRegister, setShowRegister] = useState(false)
  const [workbenchAttempt, setWorkbenchAttempt] = useState(() => createWorkbenchAttempt(loader))
  const [workbenchFailed, setWorkbenchFailed] = useState(false)
  const Workbench = workbenchAttempt.Component
  useEffect(() => {
    void workbenchAttempt.load()
  }, [workbenchAttempt])
  const locale = (typeof window !== 'undefined' && window.localStorage.getItem('locale') === 'en') ? 'en' : 'zh'
  const resetWorkbench = () => {
    setWorkbenchAttempt(createWorkbenchAttempt(loader))
    setWorkbenchFailed(false)
  }

  const handleAuthSuccess = (user: User) => {
    setWorkbenchFailed(false)
    setSession(user)
  }

  const handleLogout = () => {
    removeToken()
    setSession(false)
    setShowRegister(false)
    resetWorkbench()
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
          resetWorkbench()
        }}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <Suspense fallback={<WorkbenchFallback locale={locale} />}>
      <WorkbenchErrorBoundary
        onError={() => setWorkbenchFailed(true)}
      >
        <Workbench currentUser={session} onLogout={handleLogout} />
      </WorkbenchErrorBoundary>
    </Suspense>
  )
}
