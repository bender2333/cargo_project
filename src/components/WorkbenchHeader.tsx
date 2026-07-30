import { ReleaseNotesButton } from './ReleaseNotesButton'
import type { User } from '../lib/auth'
import type { Locale } from '../types'

type NavTarget = 'overview' | 'report' | 'cargo' | 'container' | 'history' | 'cargo-library' | 'template-manager' | 'users'

type NavItem = { target: NavTarget; label: string }

type Labels = {
  title: string
  language: string
}

type Props = {
  title: string
  navItems: NavItem[]
  activeNav: NavTarget
  onNavigate: (target: NavTarget) => void
  currentUser: User | null
  locale: Locale
  onLocaleChange: () => void
  onLogout: () => void
  workspaceMaximized: boolean
  labels: Labels
}

export function WorkbenchHeader({
  title,
  navItems,
  activeNav,
  onNavigate,
  currentUser,
  locale,
  onLocaleChange,
  onLogout,
  workspaceMaximized,
  labels,
}: Props) {
  return (
    <header className={`mb-5 rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#7c3aed] p-6 text-white ${workspaceMaximized ? 'hidden' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-[30px] font-bold">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {navItems.map((item) => (
            <button
              className={`rounded-[10px] px-4 py-2 font-bold ${activeNav === item.target ? 'bg-white text-[#1d4ed8]' : 'bg-white/20 text-white hover:bg-white/30'}`}
              key={item.target}
              type="button"
              data-testid={`nav-${item.target}`}
              onClick={() => onNavigate(item.target)}
            >
              {item.label}
            </button>
          ))}
          {currentUser && (
            <div className="flex items-center gap-2 rounded-[10px] bg-white/10 px-3 py-1.5 border border-white/20 ml-2">
              <span className="opacity-80 text-xs">{locale === 'zh' ? '用户' : 'User'}:</span>
              <span className="font-bold text-xs">{currentUser.username}</span>
              {currentUser.role === 'admin' && (
                <button
                  onClick={() => onNavigate('users')}
                  data-testid="user-management-shortcut"
                  className="rounded-[6px] bg-indigo-600 hover:bg-indigo-700 px-2 py-1 text-[11px] font-bold text-white transition-colors cursor-pointer animate-pulse"
                  type="button"
                >
                  {locale === 'zh' ? '登录审计' : 'Login audit'}
                </button>
              )}
              <button
                onClick={onLogout}
                className="rounded-[6px] bg-red-600 hover:bg-red-700 px-2 py-1 text-[11px] font-bold text-white transition-colors cursor-pointer"
                type="button"
              >
                {locale === 'zh' ? '退出' : 'Logout'}
              </button>
            </div>
          )}
          <ReleaseNotesButton locale={locale} userId={currentUser?.id ?? null} />
          <button
            className="rounded-[10px] bg-white px-4 py-2 font-bold text-[#1d4ed8]"
            type="button"
            onClick={onLocaleChange}
          >
            {labels.language}
          </button>
        </div>
      </div>
    </header>
  )
}
