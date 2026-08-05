function readCredential(name: string, fallback: string, normalize = false) {
  const value = process.env[name] ?? ''
  const trimmedValue = value.trim()
  const baseURL = process.env.PLAYWRIGHT_BASE_URL
  if (!baseURL) return trimmedValue ? (normalize ? trimmedValue : value) : fallback

  let parsedURL
  try {
    parsedURL = new URL(baseURL)
  } catch {
    throw new Error('[e2e] PLAYWRIGHT_BASE_URL must use HTTPS or loopback HTTP')
  }
  const isLoopback = parsedURL.protocol === 'http:'
    && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(parsedURL.hostname)
  if (parsedURL.protocol !== 'https:' && !isLoopback) {
    throw new Error('[e2e] PLAYWRIGHT_BASE_URL must use HTTPS or loopback HTTP')
  }
  if (!trimmedValue) throw new Error(`[e2e] ${name} is required when PLAYWRIGHT_BASE_URL is set`)
  return normalize ? trimmedValue : value
}

export const e2eCredentials = {
  user: {
    username: readCredential('E2E_USERNAME', 'testuser', true),
    password: readCredential('E2E_PASSWORD', 'testuser123'),
  },
  admin: {
    username: readCredential('E2E_ADMIN_USERNAME', 'admin', true),
    password: readCredential('E2E_ADMIN_PASSWORD', 'admin123'),
  },
} as const
