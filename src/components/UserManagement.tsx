import { useEffect, useState } from 'react'
import { fetchWithAuth } from '../lib/auth'

interface UserItem {
  id: string
  username: string
  role: 'user' | 'admin'
  disabled: number
  created_at: string
  last_login_at: string | null
  last_login_ip: string | null
}

interface UserManagementProps {
  onBack: () => void
}

export function UserManagement({ onBack }: UserManagementProps) {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchWithAuth('/api/users')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '获取用户列表失败')
      }
      const data = await res.json()
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleToggleStatus = async (user: UserItem) => {
    if (user.username === 'admin') {
      alert('不能禁用默认管理员账号')
      return
    }
    setActionLoadingId(user.id)
    try {
      const res = await fetchWithAuth(`/api/users/${user.id}/toggle-status`, {
        method: 'PUT',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '操作失败')
      }
      await fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleDeleteUser = async (user: UserItem) => {
    if (user.username === 'admin') {
      alert('不能删除默认管理员账号')
      return
    }
    if (!confirm(`确定要删除用户 "${user.username}" 吗？此操作将同时删除其所有历史方案和自定义柜型，且不可恢复！`)) {
      return
    }
    setActionLoadingId(user.id)
    try {
      const res = await fetchWithAuth(`/api/users/${user.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '操作失败')
      }
      await fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">用户账号管理</h1>
            <p className="mt-1 text-sm text-slate-500">
              管理员控制面板 - 查看用户列表、禁用或删除普通用户账号
            </p>
          </div>
          <button
            onClick={onBack}
            className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition duration-150"
          >
            ← 返回工作台
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-200">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center space-y-2">
                <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm text-slate-500">加载用户列表中...</span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      用户名
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      角色
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      注册时间
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      最近登录
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      登录 IP
                    </th>
                    <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      账号状态
                    </th>
                    <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-500">
                        暂无普通注册用户
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
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
                            {user.role === 'admin' ? '管理员' : '普通用户'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {new Date(user.created_at).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {user.last_login_at ? new Date(user.last_login_at).toLocaleString('zh-CN') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                          {user.last_login_ip ?? '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.disabled === 1 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {user.disabled === 1 ? '已禁用' : '正常'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {user.username !== 'admin' && (
                            <div className="inline-flex space-x-2">
                              <button
                                onClick={() => handleToggleStatus(user)}
                                disabled={actionLoadingId === user.id}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold focus:outline-none transition duration-150 ${
                                  user.disabled === 1
                                    ? 'bg-green-50 text-green-700 hover:bg-green-100'
                                    : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                                }`}
                              >
                                {user.disabled === 1 ? '启用' : '禁用'}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user)}
                                disabled={actionLoadingId === user.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 focus:outline-none transition duration-150"
                              >
                                删除
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
