import { fetchWithAuth } from './client'

export type ManagedUser = {
  id: string
  username: string
  role: 'user' | 'admin'
  disabled: boolean
  createdAt: string
  lastLoginAt: string | null
  lastLoginIp: string | null
}

type ResponseKind = 'list' | 'operation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNullableNonBlankString(value: unknown): value is string | null {
  return value === null || isNonBlankString(value)
}

function invalidResponse(kind: ResponseKind, invalidJson = false): Error {
  const subject = kind === 'list' ? '获取用户列表' : '操作'
  return new Error(`${subject}响应格式无效${invalidJson ? '：服务器响应不是有效 JSON' : ''}`)
}

function failedResponse(kind: ResponseKind, status: number): Error {
  return new Error(kind === 'list' ? `获取用户列表失败 (HTTP ${status})` : '操作失败')
}

async function readJson(
  path: string,
  options: RequestInit | undefined,
  kind: ResponseKind,
): Promise<unknown> {
  const response = options
    ? await fetchWithAuth(path, options)
    : await fetchWithAuth(path)

  if (!response.ok) {
    let data: unknown
    try {
      data = await response.json()
    } catch {
      throw failedResponse(kind, response.status)
    }
    if (isRecord(data) && isNonBlankString(data.error)) {
      throw new Error(data.error)
    }
    throw failedResponse(kind, response.status)
  }

  try {
    return await response.json()
  } catch {
    throw invalidResponse(kind, true)
  }
}

function managedUserFromDto(value: unknown): ManagedUser {
  if (
    !isRecord(value)
    || !isNonBlankString(value.id)
    || !isNonBlankString(value.username)
    || (value.role !== 'user' && value.role !== 'admin')
    || (value.disabled !== 0 && value.disabled !== 1)
    || !isNonBlankString(value.created_at)
    || !isNullableNonBlankString(value.last_login_at)
    || !isNullableNonBlankString(value.last_login_ip)
  ) {
    throw invalidResponse('list')
  }

  return {
    id: value.id,
    username: value.username,
    role: value.role,
    disabled: value.disabled === 1,
    createdAt: value.created_at,
    lastLoginAt: value.last_login_at,
    lastLoginIp: value.last_login_ip,
  }
}

function assertMutationResponse(value: unknown, includesDisabled: boolean): void {
  if (
    !isRecord(value)
    || !isNonBlankString(value.message)
    || (includesDisabled && typeof value.disabled !== 'boolean')
  ) {
    throw invalidResponse('operation')
  }
}

export async function readManagedUsers(): Promise<ManagedUser[]> {
  const data = await readJson('/api/users', undefined, 'list')
  if (!Array.isArray(data)) throw invalidResponse('list')
  return data.map(managedUserFromDto)
}

export async function toggleManagedUserStatus(id: string): Promise<void> {
  const data = await readJson(`/api/users/${id}/toggle-status`, { method: 'PUT' }, 'operation')
  assertMutationResponse(data, true)
}

export async function deleteManagedUser(id: string): Promise<void> {
  const data = await readJson(`/api/users/${id}`, { method: 'DELETE' }, 'operation')
  assertMutationResponse(data, false)
}
