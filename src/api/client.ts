import { getToken, removeToken } from '../lib/auth'

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const requestToken = getToken()
  const headers = {
    ...options.headers,
    ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}),
    'Content-Type': 'application/json',
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (response.status === 401 && getToken() === requestToken) {
    removeToken()
    window.location.href = '/login'
  }

  return response
}
