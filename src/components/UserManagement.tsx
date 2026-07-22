import { useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteManagedUser,
  readManagedUsers,
  toggleManagedUserStatus,
} from '../api/users'
import type { ManagedUser } from '../api/users'

interface UserManagementProps {
  onBack: () => void
}

// i18n copy. The admin panel does not yet receive a locale prop, so we keep the
// existing Chinese strings as the runtime default and pre-stage English keys for
// the next locale rollout. Keys are explicit so future wiring is a single
// `t = copy[locale]` substitution.
const copy = {
  zh: {
    title: '用户账号管理',
    subtitle: '管理员控制面板 - 查看用户列表、禁用或删除普通用户账号',
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
      actions: '操作',
    },
    roleAdmin: '管理员',
    roleUser: '普通用户',
    statusDisabled: '已禁用',
    statusActive: '正常',
    actionEnable: '启用',
    actionDisable: '禁用',
    actionDelete: '删除',
    emptySearch: '没有匹配的用户，尝试调整搜索关键字',
    emptyAll: '暂无普通注册用户',
    loading: '加载用户列表中...',
    fetchFail: '获取用户列表失败',
    actionFail: '操作失败',
    cannotDisableAdmin: '不能禁用默认管理员账号',
    cannotDeleteAdmin: '不能删除默认管理员账号',
    confirmDelete: (name: string) =>
      `确定要删除用户 "${name}" 吗？此操作将同时删除其所有历史方案和自定义柜型，且不可恢复！`,
  },
  en: {
    title: 'User Account Management',
    subtitle: 'Admin console — list users, disable or delete regular accounts',
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
      actions: 'Actions',
    },
    roleAdmin: 'Admin',
    roleUser: 'User',
    statusDisabled: 'Disabled',
    statusActive: 'Active',
    actionEnable: 'Enable',
    actionDisable: 'Disable',
    actionDelete: 'Delete',
    emptySearch: 'No users match the current search',
    emptyAll: 'No regular users have registered yet',
    loading: 'Loading users...',
    fetchFail: 'Failed to fetch users',
    actionFail: 'Operation failed',
    cannotDisableAdmin: 'Cannot disable the default admin account',
    cannotDeleteAdmin: 'Cannot delete the default admin account',
    confirmDelete: (name: string) =>
      `Delete user "${name}"? This also removes their history plans and custom containers. This cannot be undone.`,
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
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const latestRequestId = useRef(0)
  const locale = resolveLocale()
  const t = copy[locale]

  const errorMessage = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    if (message === copy.zh.actionFail) return t.actionFail
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
      // Defensive: preserve newest-first ordering if the backend order changes.
      setUsers(sortByCreatedAtDesc(data))
    } catch (err) {
      if (requestId !== latestRequestId.current) return
      setError(errorMessage(err))
    } finally {
      if (requestId === latestRequestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggleStatus = async (user: ManagedUser) => {
    if (user.username === 'admin') {
      alert(t.cannotDisableAdmin)
      return
    }
    setActionLoadingId(user.id)
    try {
      await toggleManagedUserStatus(user.id)
      await fetchUsers()
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      alert(message)
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleDeleteUser = async (user: ManagedUser) => {
    if (user.username === 'admin') {
      alert(t.cannotDeleteAdmin)
      return
    }
    if (!confirm(t.confirmDelete(user.username))) {
      return
    }
    setActionLoadingId(user.id)
    try {
      await deleteManagedUser(user.id)
      await fetchUsers()
    } catch (err) {
      const message = errorMessage(err)
      setError(message)
      alert(message)
    } finally {
      setActionLoadingId(null)
    }
  }

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
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">{t.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
          </div>
          <button
            onClick={onBack}
            className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition duration-150"
          >
            {t.back}
          </button>
        </div>

        {error && (
          <div
            className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700 flex items-start justify-between gap-4"
            role="alert"
            data-testid="user-management-error"
          >
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-red-500 hover:text-red-700 font-bold"
              aria-label="dismiss"
            >
              ×
            </button>
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 flex-1">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.search}
              className="block w-full sm:max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              data-testid="user-search-input"
            />
            <span className="text-xs text-slate-500" data-testid="user-count-summary">
              {hasSearch ? t.searchResult(matchCount, totalCount) : t.total(totalCount)}
            </span>
          </div>
          <button
            type="button"
            onClick={fetchUsers}
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
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t.columns.username}
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t.columns.role}
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t.columns.created}
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t.columns.lastLogin}
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t.columns.lastIp}
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t.columns.status}
                    </th>
                    <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {t.columns.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
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
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {user.username !== 'admin' && (
                            <div className="inline-flex space-x-2">
                              <button
                                onClick={() => handleToggleStatus(user)}
                                disabled={actionLoadingId === user.id}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold focus:outline-none transition duration-150 ${
                                  user.disabled
                                    ? 'bg-green-50 text-green-700 hover:bg-green-100'
                                    : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                                }`}
                              >
                                {user.disabled ? t.actionEnable : t.actionDisable}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user)}
                                disabled={actionLoadingId === user.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 focus:outline-none transition duration-150"
                              >
                                {t.actionDelete}
                              </button>
                            </div>
                          )}
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
