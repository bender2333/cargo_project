import { useEffect, useMemo, useRef, useState } from 'react'
import { readManagedUsers } from '../api/users'
import type { ManagedUser } from '../api/users'

interface UserManagementProps {
  onBack: () => void
}

// Audit-only admin panel. Account CRUD (create/disable/delete) is intentionally
// out of product scope for this milestone; backend isolation/login remains.
const copy = {
  zh: {
    title: '用户登录审计',
    subtitle: '管理员只读面板 — 查看注册时间、最近登录时间和登录 IP',
    back: '← 返回工作台',
    refresh: '刷新',
    refreshing: '刷新中...',
    search: '搜索用户名',
    total: (n: number) => `共 ${n} 个用户`,
    searchResult: (m: number, n: number) => `${m} / ${n} 匹配`,
    columns: {
      username: '用户名',
      role: '角色',
      created: '注册时间',
      lastLogin: '最近登录',
      lastIp: '登录 IP',
      status: '账号状态',
    },
    roleAdmin: '管理员',
    roleUser: '普通用户',
    statusDisabled: '已禁用',
    statusActive: '正常',
    emptySearch: '没有匹配的用户，尝试调整搜索关键字',
    emptyAll: '暂无普通注册用户',
    loading: '加载用户列表中...',
    fetchFail: '获取用户列表失败',
  },
  en: {
    title: 'User Login Audit',
    subtitle: 'Admin read-only panel — registration time, last login, and IP',
    back: '← Back to workbench',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    search: 'Search by username',
    total: (n: number) => `${n} users total`,
    searchResult: (m: number, n: number) => `${m} / ${n} matches`,
    columns: {
      username: 'Username',
      role: 'Role',
      created: 'Registered',
      lastLogin: 'Last login',
      lastIp: 'Last IP',
      status: 'Status',
    },
    roleAdmin: 'Admin',
    roleUser: 'User',
    statusDisabled: 'Disabled',
    statusActive: 'Active',
    emptySearch: 'No users match the current search',
    emptyAll: 'No regular users have registered yet',
    loading: 'Loading users...',
    fetchFail: 'Failed to fetch users',
  },
} as const

type Locale = keyof typeof copy

function resolveLocale(): Locale {
  if (typeof window === 'undefined') return 'zh'
  try {
    const stored = window.localStorage.getItem('locale')
    if (stored === 'en' || stored === 'zh') return stored
  } catch {
    // ignore storage access errors (e.g. private mode)
  }
  return 'zh'
}

function sortByCreatedAtDesc(users: ManagedUser[]): ManagedUser[] {
  return [...users].sort((a, b) => {
    const ta = Date.parse(a.createdAt)
    const tb = Date.parse(b.createdAt)
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0
    if (Number.isNaN(ta)) return 1
    if (Number.isNaN(tb)) return -1
    return tb - ta
  })
}

export function UserManagement({ onBack }: UserManagementProps) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const latestRequestId = useRef(0)
  const locale = resolveLocale()
  const t = copy[locale]

  const errorMessage = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith(`${copy.zh.fetchFail} (HTTP `)) {
      return message.replace(copy.zh.fetchFail, t.fetchFail)
    }
    return message
  }

  const fetchUsers = async () => {
    const requestId = ++latestRequestId.current
    setLoading(true)
    setError('')
    try {
      const data = await readManagedUsers()
      if (requestId !== latestRequestId.current) return
      setUsers(sortByCreatedAtDesc(data))
    } catch (err) {
      if (requestId !== latestRequestId.current) return
      setError(errorMessage(err))
    } finally {
      if (requestId === latestRequestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    void fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return users
    return users.filter((user) => user.username.toLowerCase().includes(term))
  }, [users, search])

  const totalCount = users.length
  const matchCount = filteredUsers.length
  const hasSearch = search.trim().length > 0

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="user-management-title">{t.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center justify-center px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50"
          >
            {t.back}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="user-management-error">
            {error}
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 flex-1">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t.search}
              className="w-full sm:max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
              data-testid="user-search-input"
            />
            <span className="text-xs text-slate-500" data-testid="user-count-summary">
              {hasSearch ? t.searchResult(matchCount, totalCount) : t.total(totalCount)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void fetchUsers()}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 border border-purple-200 rounded-lg text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition duration-150 disabled:opacity-60"
            data-testid="user-refresh-button"
          >
            {loading ? t.refreshing : t.refresh}
          </button>
        </div>

        <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-200">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center space-y-2">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-slate-500">{t.loading}</span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.columns.username}</th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.columns.role}</th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.columns.created}</th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.columns.lastLogin}</th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.columns.lastIp}</th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t.columns.status}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                        {hasSearch ? t.emptySearch : t.emptyAll}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50 transition duration-150">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-bold">
                              {user.username.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-slate-900">{user.username}</div>
                              <div className="text-xs text-slate-500">ID: {user.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.role === 'admin' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {user.role === 'admin' ? t.roleAdmin : t.roleUser}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {new Date(user.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')
                            : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                          {user.lastLoginIp ?? '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.disabled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {user.disabled ? t.statusDisabled : t.statusActive}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
