export interface User {
  id: string
  username: string
  role: 'user' | 'admin'
}

export function getToken(): string | null {
  return localStorage.getItem('cargo_token')
}

export function setToken(token: string) {
  localStorage.setItem('cargo_token', token)
}

export function removeToken() {
  localStorage.removeItem('cargo_token')
}

export function getAuthHeaders(token: string | null = getToken()): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

export function getCurrentUser(): User | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1] || ''))
    return {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    }
  } catch (err) {
    console.error('Failed to parse token payload:', err)
    return null
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const requestToken = getToken()
  const headers = {
    ...options.headers,
    ...getAuthHeaders(requestToken),
    'Content-Type': 'application/json',
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  })
  
  if (response.status === 401 && getToken() === requestToken) {
    // Session expired or unauthorized, logout
    removeToken()
    window.location.href = '/login'
  }
  
  return response
}

export function logout() {
  removeToken()
  window.location.href = '/login'
}
