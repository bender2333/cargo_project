import { useState } from 'react'
import { setToken } from '../lib/auth'
import type { User } from '../lib/auth'

type LoginPageProps = {
  onLoginSuccess: (user: User) => void
  onToggleRegister: () => void
}

export function LoginPage({ onLoginSuccess, onToggleRegister }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { login } = await import('../api/auth')
      const result = await login({ username, password })
      setToken(result.token)
      onLoginSuccess(result.user)
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err)
      if (message === 'Account has been disabled') {
        message = '账号已被禁用'
      } else if (message === 'Invalid username or password') {
        message = '用户名或密码错误'
      } else if (message === 'Username and password are required') {
        message = '请输入用户名和密码'
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
            货柜装箱计算系统
          </h2>
          <p className="mt-2 text-center text-sm text-gray-300">
            集装箱智能排布与装箱复核工作台
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
          </div>

          <div>
            <button
              className="group relative flex w-full justify-center rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 text-sm font-medium text-white hover:from-purple-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 transition duration-200"
              type="submit"
              disabled={loading}
            >
              {loading ? '正在登录...' : '登录'}
            </button>
          </div>
        </form>

        <div className="text-center mt-4">
          <button
            className="text-sm font-medium text-purple-300 hover:text-purple-200 transition duration-200"
            type="button"
            onClick={onToggleRegister}
          >
            没有账号？立即注册
          </button>
        </div>
      </div>
    </div>
  )
}
