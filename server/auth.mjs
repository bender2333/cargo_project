import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from './db.mjs'
import { JWT_SECRET, authenticate } from './middleware.mjs'

const router = express.Router()

function logRegistration(stage, username, extra) {
  const ts = new Date().toISOString()
  const safeName = typeof username === 'string' ? username : '<invalid>'
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
  if (username.trim().length < 3) {
    logRegistration('rejected', rawUsername, 'username_too_short')
    return res.status(400).json({ error: 'Username must be at least 3 characters long' })
  }
  if (!password || typeof password !== 'string') {
    logRegistration('rejected', rawUsername, 'password_required')
    return res.status(400).json({ error: 'Password is required' })
  }
  if (password.length < 6) {
    logRegistration('rejected', rawUsername, 'password_too_short')
    return res.status(400).json({ error: 'Password too short' })
  }

  const normalized = username.trim()

  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(normalized)
    if (existing) {
      logRegistration('rejected', normalized, 'username_already_exists')
      return res.status(409).json({ error: 'Username already exists' })
    }

    const id = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const salt = bcrypt.genSaltSync(10)
    const password_hash = bcrypt.hashSync(password, salt)
    const created_at = new Date().toISOString()

    try {
      db.prepare(`
        INSERT INTO users (id, username, password_hash, role, disabled, created_at)
        VALUES (?, ?, ?, 'user', 0, ?)
      `).run(id, normalized, password_hash, created_at)
    } catch (insertErr) {
      console.error('[register] insert failed:', insertErr.message)
      logRegistration('failed', normalized, `db_insert_error:${insertErr.message}`)
      return res.status(500).json({ error: 'Database error during registration' })
    }

    // Read back the persisted row to guarantee the user is queryable before we respond.
    const persisted = db
      .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
      .get(id)
    if (!persisted) {
      logRegistration('failed', normalized, 'post_insert_lookup_missing')
      return res.status(500).json({ error: 'Database error during registration' })
    }

    const token = jwt.sign(
      { id: persisted.id, username: persisted.username, role: persisted.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    logRegistration('success', persisted.username, `id=${persisted.id}`)
    res.status(201).json({
      token,
      user: persisted,
    })
  } catch (err) {
    console.error('Registration Error:', err.message)
    logRegistration('failed', normalized, `unhandled:${err.message}`)
    res.status(500).json({ error: 'Database error during registration' })
  }
})

router.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim())
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

    // Record audit fields: last login timestamp and source IP
    const last_login_at = new Date().toISOString()
    const last_login_ip =
      req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null
    try {
      db.prepare('UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE id = ?').run(
        last_login_at,
        last_login_ip,
        user.id
      )
    } catch (auditErr) {
      // Audit logging should not block login; surface in server logs only
      console.error('Login Audit Error:', auditErr.message)
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role }
    })
  } catch (err) {
    console.error('Login Error:', err.message)
    res.status(500).json({ error: 'Database error during login' })
  }
})

router.post('/change-password', authenticate, (req, res) => {
  const { oldPassword, newPassword } = req.body

  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' })
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const matches = bcrypt.compareSync(oldPassword, user.password_hash)
    if (!matches) {
      return res.status(400).json({ error: 'Incorrect old password' })
    }

    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync(newPassword, salt)

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id)
    res.json({ message: 'Password changed successfully' })
  } catch (err) {
    console.error('Change Password Error:', err.message)
    res.status(500).json({ error: 'Database error during password change' })
  }
})

export default router
