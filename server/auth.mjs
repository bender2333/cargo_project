import express from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import db from './db.mjs'
import { authenticate, signToken } from './middleware.mjs'

const router = express.Router()

const BCRYPT_COST = 12
const USERNAME_MAX = 32
const PASSWORD_MAX = 128
const USERNAME_PATTERN = /^[A-Za-z0-9_\-.]+$/

function logRegistration(stage, username, extra) {
  const ts = new Date().toISOString()
  const safeName = typeof username === 'string' ? username.replace(/[\r\n]/g, ' ').slice(0, 64) : '<invalid>'
  const tail = extra ? ` reason="${extra}"` : ''
  console.log(`[register] ${ts} stage=${stage} username="${safeName}"${tail}`)
}

router.post('/register', (req, res) => {
  const { username, password } = req.body
  const rawUsername = typeof username === 'string' ? username : ''
  logRegistration('attempt', rawUsername)

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    logRegistration('rejected', rawUsername, 'empty_username')
    return res.status(400).json({ error: 'Username is required' })
  }
  const normalized = username.trim()
  if (normalized.length < 3 || normalized.length > USERNAME_MAX) {
    logRegistration('rejected', rawUsername, 'username_length')
    return res.status(400).json({ error: `Username must be 3-${USERNAME_MAX} characters long` })
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    logRegistration('rejected', rawUsername, 'username_pattern')
    return res.status(400).json({ error: 'Username may only contain letters, digits, dot, underscore or dash' })
  }
  if (!password || typeof password !== 'string') {
    logRegistration('rejected', rawUsername, 'password_required')
    return res.status(400).json({ error: 'Password is required' })
  }
  if (password.length < 6 || password.length > PASSWORD_MAX) {
    logRegistration('rejected', rawUsername, 'password_length')
    return res.status(400).json({ error: `Password must be 6-${PASSWORD_MAX} characters long` })
  }

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(normalized)
    if (existing) {
      logRegistration('rejected', normalized, 'username_already_exists')
      return res.status(409).json({ error: 'Username already exists' })
    }

    const id = randomUUID()
    const salt = bcrypt.genSaltSync(BCRYPT_COST)
    const password_hash = bcrypt.hashSync(password, salt)
    const created_at = new Date().toISOString()

    try {
      db.prepare(`
        INSERT INTO users (id, username, password_hash, role, disabled, created_at, password_changed_at)
        VALUES (?, ?, ?, 'user', 0, ?, ?)
      `).run(id, normalized, password_hash, created_at, created_at)
    } catch (insertErr) {
      console.error('[register] insert failed:', insertErr.message)
      logRegistration('failed', normalized, 'db_insert_error')
      return res.status(500).json({ error: 'Database error during registration' })
    }

    const persisted = db
      .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
      .get(id)
    if (!persisted) {
      logRegistration('failed', normalized, 'post_insert_lookup_missing')
      return res.status(500).json({ error: 'Database error during registration' })
    }

    const token = signToken({ id: persisted.id, username: persisted.username, role: persisted.role })

    logRegistration('success', persisted.username, `id=${persisted.id}`)
    res.status(201).json({ token, user: persisted })
  } catch (err) {
    console.error('Registration Error:', err.message)
    logRegistration('failed', normalized, 'unhandled')
    res.status(500).json({ error: 'Database error during registration' })
  }
})

router.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' })
  }
  if (username.length > USERNAME_MAX || password.length > PASSWORD_MAX) {
    return res.status(400).json({ error: 'Username or password is too long' })
  }

  try {
    const user = db
      .prepare('SELECT id, username, role, disabled, password_hash FROM users WHERE username = ?')
      .get(username.trim())
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    if (user.disabled === 1) {
      return res.status(403).json({ error: 'Account has been disabled' })
    }

    const matches = bcrypt.compareSync(password, user.password_hash)
    if (!matches) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    // Record audit fields: last login timestamp and source IP (single, trimmed value)
    const last_login_at = new Date().toISOString()
    const forwarded = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : null
    const candidate = req.ip || forwarded || req.socket?.remoteAddress || null
    const last_login_ip = candidate ? String(candidate).replace(/[\r\n\t]/g, '').slice(0, 64) : null
    try {
      db.prepare('UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE id = ?').run(
        last_login_at,
        last_login_ip,
        user.id
      )
    } catch (auditErr) {
      console.error('Login Audit Error:', auditErr.message)
    }

    const token = signToken({ id: user.id, username: user.username, role: user.role })

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } })
  } catch (err) {
    console.error('Login Error:', err.message)
    res.status(500).json({ error: 'Database error during login' })
  }
})

router.post('/change-password', authenticate, (req, res) => {
  const { oldPassword, newPassword } = req.body

  if (!oldPassword || typeof oldPassword !== 'string' || !newPassword || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Old and new password are required' })
  }
  if (newPassword.length < 6 || newPassword.length > PASSWORD_MAX) {
    return res.status(400).json({ error: `New password must be 6-${PASSWORD_MAX} characters long` })
  }

  try {
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const matches = bcrypt.compareSync(oldPassword, user.password_hash)
    if (!matches) {
      return res.status(400).json({ error: 'Incorrect old password' })
    }

    const salt = bcrypt.genSaltSync(BCRYPT_COST)
    const hash = bcrypt.hashSync(newPassword, salt)

    db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?')
      .run(hash, new Date().toISOString(), req.user.id)
    res.json({ message: 'Password changed successfully' })
  } catch (err) {
    console.error('Change Password Error:', err.message)
    res.status(500).json({ error: 'Database error during password change' })
  }
})

export default router
