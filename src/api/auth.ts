import type { User } from '../lib/auth'

export type { User } from '../lib/auth'

export type AuthCredentials = {
  username: string
  password: string
}

export type AuthResult = {
  token: string
  user: User
}

type AuthAction = '登录' | '注册'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function responseError(data: unknown, action: AuthAction, status: number): Error {
  if (isRecord(data) && typeof data.error === 'string' && data.error.trim()) {
    return new Error(data.error)
  }
  return new Error(`${action}失败（HTTP ${status}）`)
}

function authResultFromDto(data: unknown, action: AuthAction): AuthResult {
  if (!isRecord(data) || !isNonEmptyString(data.token)) {
    throw new Error(`${action}响应格式无效`)
  }

  const user = data.user
  if (
    !isRecord(user)
    || !isNonEmptyString(user.id)
    || !isNonEmptyString(user.username)
    || (user.role !== 'user' && user.role !== 'admin')
  ) {
    throw new Error(`${action}响应格式无效`)
  }

  return {
    token: data.token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  }
}

async function authenticate(
  path: '/api/auth/login' | '/api/auth/register',
  action: AuthAction,
  credentials: AuthCredentials,
): Promise<AuthResult> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${action}请求失败：${message}`, { cause: error })
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    if (!response.ok) {
      throw new Error(`${action}失败（HTTP ${response.status}）：服务器响应不是有效 JSON`)
    }
    throw new Error(`${action}响应格式无效：服务器响应不是有效 JSON`)
  }

  if (!response.ok) throw responseError(data, action, response.status)
  return authResultFromDto(data, action)
}

export function login(credentials: AuthCredentials): Promise<AuthResult> {
  return authenticate('/api/auth/login', '登录', credentials)
}

export function register(credentials: AuthCredentials): Promise<AuthResult> {
  return authenticate('/api/auth/register', '注册', credentials)
}
