import bcrypt from 'bcryptjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

const initialEnvironment = { ...process.env }
let currentDb

function restoreEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (!(key in initialEnvironment)) delete process.env[key]
  }
  Object.assign(process.env, initialEnvironment)
}

async function importDatabase(environment = {}) {
  vi.resetModules()
  restoreEnvironment()
  process.env.CARGO_DB_PATH = ':memory:'
  delete process.env.ADMIN_PASSWORD
  delete process.env.SKIP_TESTUSER
  Object.assign(process.env, environment)

  const databaseModule = await import('../server/db.mjs')
  currentDb = databaseModule.default
  return databaseModule
}

const e2eCredentialNames = [
  'E2E_USERNAME',
  'E2E_PASSWORD',
  'E2E_ADMIN_USERNAME',
  'E2E_ADMIN_PASSWORD',
]
const externalCredentialEnvironment = {
  E2E_USERNAME: 'remote-user',
  E2E_PASSWORD: 'remote-password',
  E2E_ADMIN_USERNAME: 'remote-admin',
  E2E_ADMIN_PASSWORD: 'remote-admin-password',
}


async function importE2ECredentials(environment = {}) {
  vi.resetModules()
  restoreEnvironment()
  for (const name of e2eCredentialNames) delete process.env[name]
  delete process.env.PLAYWRIGHT_BASE_URL
  Object.assign(process.env, environment)
  return import('../e2e/credentials.ts')
}


afterEach(() => {
  if (currentDb?.open) currentDb.close()
  currentDb = undefined
  restoreEnvironment()
  vi.resetModules()
})

describe('database seed safety', () => {
  it('does not seed testuser in production', async () => {
    const { default: db } = await importDatabase({
      NODE_ENV: 'production',
      ADMIN_PASSWORD: 'production-admin-password-0123456789',
    })

    expect(db.prepare('SELECT * FROM users WHERE username = ?').all('testuser')).toEqual([])
  })

  it('seeds the default testuser in nonproduction with the default password', async () => {
    const { default: db } = await importDatabase({ NODE_ENV: 'test' })
    const user = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('testuser')

    expect(user).toBeDefined()
    expect(bcrypt.compareSync('testuser123', user.password_hash)).toBe(true)
  })

  it('honors SKIP_TESTUSER in nonproduction', async () => {
    const { default: db } = await importDatabase({ NODE_ENV: 'test', SKIP_TESTUSER: '1' })

    expect(db.prepare('SELECT * FROM users WHERE username = ?').all('testuser')).toEqual([])
  })

  it('throws when production starts a new database without ADMIN_PASSWORD', async () => {
    await expect(importDatabase({ NODE_ENV: 'production' })).rejects.toThrow(/ADMIN_PASSWORD/)
  })

  it('throws when an existing production database lacks ADMIN_PASSWORD', async () => {
    const databaseModule = await importDatabase({
      NODE_ENV: 'production',
      ADMIN_PASSWORD: 'production-admin-password-0123456789',
    })
    delete process.env.ADMIN_PASSWORD

    expect(() => databaseModule.initAdmin()).toThrow(/ADMIN_PASSWORD/)
  })

  it('starts production with the configured ADMIN_PASSWORD', async () => {
    const password = 'production-admin-password-0123456789'
    const { default: db } = await importDatabase({ NODE_ENV: 'production', ADMIN_PASSWORD: password })
    const admin = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('admin')

    expect(bcrypt.compareSync(password, admin.password_hash)).toBe(true)
  })

  it('keeps the nonproduction default admin fallback', async () => {
    const { default: db } = await importDatabase({ NODE_ENV: 'test' })
    const admin = db.prepare('SELECT password_hash FROM users WHERE username = ?').get('admin')

    expect(admin).toBeDefined()
    expect(bcrypt.compareSync('admin123', admin.password_hash)).toBe(true)
  })
})

describe('E2E credential configuration', () => {
  it('uses nonproduction defaults without an external base URL', async () => {
    const { e2eCredentials } = await importE2ECredentials()

    expect(e2eCredentials).toEqual({
      user: { username: 'testuser', password: 'testuser123' },
      admin: { username: 'admin', password: 'admin123' },
    })
  })

  it.each(['user', 'admin'])('allows the %s role without credentials for the other role', async (role) => {
    const isAdmin = role === 'admin'
    const { e2eCredentials } = await importE2ECredentials({
      PLAYWRIGHT_BASE_URL: 'https://production.example.test',
      [isAdmin ? 'E2E_ADMIN_USERNAME' : 'E2E_USERNAME']: ' remote-role ',
      [isAdmin ? 'E2E_ADMIN_PASSWORD' : 'E2E_PASSWORD']: ' role-password ',
    })

    expect(e2eCredentials[role]).toEqual({ username: 'remote-role', password: ' role-password ' })
    expect(() => e2eCredentials[isAdmin ? 'user' : 'admin']).toThrow(
      isAdmin ? 'E2E_USERNAME' : 'E2E_ADMIN_USERNAME',
    )
  })

  it('rejects every missing external credential when its role is read', async () => {
    for (const name of e2eCredentialNames) {
      const environment = {
        PLAYWRIGHT_BASE_URL: 'https://production.example.test',
        ...externalCredentialEnvironment,
      }
      delete environment[name]
      const { e2eCredentials } = await importE2ECredentials(environment)
      const role = name.startsWith('E2E_ADMIN_') ? 'admin' : 'user'
      expect(() => e2eCredentials[role]).toThrow(name)
    }
  })

  it('rejects public HTTP external runs before using credentials', async () => {
    const { e2eCredentials } = await importE2ECredentials({
      PLAYWRIGHT_BASE_URL: 'http://101.33.232.150/',
      ...externalCredentialEnvironment,
    })
    expect(() => e2eCredentials.user).toThrow(/HTTPS|loopback/)
    expect(() => e2eCredentials.admin).toThrow(/HTTPS|loopback/)
  })

  it('uses all configured credentials for HTTPS and loopback HTTP', async () => {
    for (const baseURL of ['https://production.example.test', 'http://127.0.0.1:5176', 'http://[::1]:5176']) {
      const { e2eCredentials } = await importE2ECredentials({
        PLAYWRIGHT_BASE_URL: baseURL,
        ...externalCredentialEnvironment,
      })

      expect(e2eCredentials).toEqual({
        user: { username: 'remote-user', password: 'remote-password' },
        admin: { username: 'remote-admin', password: 'remote-admin-password' },
      })
    }

  })
  it('normalizes usernames while preserving nonblank password bytes', async () => {
    const { e2eCredentials } = await importE2ECredentials({
      PLAYWRIGHT_BASE_URL: 'https://production.example.test',
      E2E_USERNAME: ' remote-user ',
      E2E_PASSWORD: ' remote password ',
      E2E_ADMIN_USERNAME: ' remote-admin ',
      E2E_ADMIN_PASSWORD: ' remote admin password ',
    })

    expect(e2eCredentials).toEqual({
      user: { username: 'remote-user', password: ' remote password ' },
      admin: { username: 'remote-admin', password: ' remote admin password ' },
    })
  })

})
