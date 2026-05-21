import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from './db.mjs'
import { JWT_SECRET, authenticate } from './middleware.mjs'

const router = express.Router()

router.post('/register', (req, res) => {
  const { username, password } = req.body

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long' })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' })
  }

  const normalized = username.trim()
  
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(normalized)
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' })
    }

    const id = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const salt = bcrypt.genSaltSync(10)
    const password_hash = bcrypt.hashSync(password, salt)
    const created_at = new Date().toISOString()

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, disabled, created_at)
      VALUES (?, ?, ?, 'user', 0, ?)
    `).run(id, normalized, password_hash, created_at)

    const token = jwt.sign({ id, username: normalized, role: 'user' }, JWT_SECRET, { expiresIn: '7d' })

    res.status(201).json({
      token,
      user: { id, username: normalized, role: 'user' }
    })
  } catch (err) {
    console.error('Registration Error:', err.message)
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
