import { useState } from 'react'
import { setToken } from '../lib/auth'
import type { User } from '../lib/auth'

type RegisterPageProps = {
  onRegisterSuccess: (user: User) => void
  onToggleLogin: () => void
}

export function RegisterPage({ onRegisterSuccess, onToggleLogin }: RegisterPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('两次密码输入不一致')
      return
    }

    setLoading(true)

    try {
      const { register } = await import('../api/auth')
      const result = await register({ username, password })
      setToken(result.token)
      onRegisterSuccess(result.user)
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err)
      if (message === 'Username is required') {
        message = '请输入用户名'
      } else if (message === 'Username must be at least 3 characters long') {
        message = '用户名长度必须至少为 3 个字符'
      } else if (message === 'Password is required') {
        message = '请输入密码'
      } else if (
        message === 'Password too short' ||
        message === 'Password must be at least 6 characters long'
      ) {
        message = '密码长度必须至少为 6 个字符'
      } else if (
        message === 'Username already exists' ||
        message === 'Username already taken'
      ) {
        message = '用户名已被占用'
      } else if (message === 'Database error during registration') {
        message = '注册失败，请稍后重试或联系管理员'
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-tr from-[#1e1b4b] via-[#311042] to-[#111827] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white/10 p-8 shadow-2xl backdrop-blur-md border border-white/20">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-white">
            创建新账号
          </h2>
          <p className="mt-2 text-center text-sm text-gray-300">
            加入集装箱排布与装箱复核工作台
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-500/20 p-3 text-sm text-red-200 border border-red-500/30">
              {error}
            </div>
          )}
          <div className="space-y-4 rounded-md shadow-sm">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1" htmlFor="username">
                用户名
              </label>
              <input
                className="relative block w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-white placeholder-gray-400 focus:z-10 focus:border-purple-500 focus:outline-none focus:ring-purple-500 sm:text-sm"
                id="username"
                name="username"
                required
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1" htmlFor="password">
                密码
              </label>
              <input
                className="relative block w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-white placeholder-gray-400 focus:z-10 focus:border-purple-500 focus:outline-none focus:ring-purple-500 sm:text-sm"
                id="password"
                name="password"
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1" htmlFor="confirmPassword">
                确认密码
              </label>
              <input
                className="relative block w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-white placeholder-gray-400 focus:z-10 focus:border-purple-500 focus:outline-none focus:ring-purple-500 sm:text-sm"
                id="confirmPassword"
                name="confirmPassword"
                required
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入密码"
              />
            </div>
          </div>

          <div>
            <button
              className="group relative flex w-full justify-center rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 text-sm font-medium text-white hover:from-purple-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 transition duration-200"
              type="submit"
              disabled={loading}
            >
              {loading ? '正在注册...' : '注册'}
            </button>
          </div>
        </form>

        <div className="text-center mt-4">
          <button
            className="text-sm font-medium text-purple-300 hover:text-purple-200 transition duration-200"
            type="button"
            onClick={onToggleLogin}
          >
            已有账号？立即登录
          </button>
        </div>
      </div>
    </div>
  )
}
