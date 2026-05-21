import jwt from 'jsonwebtoken'
import db from './db.mjs'

export const JWT_SECRET = process.env.JWT_SECRET || 'cargo-secret-key-12345'

export function authenticate(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Authentication token missing' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    
    // Check if user still exists and is not disabled
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id)
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' })
    }
    if (user.disabled === 1) {
      return res.status(403).json({ error: 'User account is disabled' })
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
    }
    next()
  } catch (err) {
    console.error('JWT Verification Error:', err.message)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator privilege required' })
  }
  next()
}
