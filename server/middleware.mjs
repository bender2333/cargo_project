import jwt from 'jsonwebtoken'
import db from './db.mjs'

const DEFAULT_DEV_SECRET = 'cargo-secret-key-12345'

function readJwtSecret() {
  const fromEnv = process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!fromEnv || fromEnv.length < 32 || fromEnv === DEFAULT_DEV_SECRET) {
      throw new Error('JWT_SECRET environment variable must be set to a value of at least 32 characters in production')
    }
    return fromEnv
  }
  return fromEnv && fromEnv.length >= 16 ? fromEnv : DEFAULT_DEV_SECRET
}

export const JWT_SECRET = readJwtSecret()
export const JWT_ALG = 'HS256'

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { algorithm: JWT_ALG, expiresIn: '7d' })
}

export function authenticate(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Authentication token missing' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALG] })

    // Check if user still exists and is not disabled
    const user = db
      .prepare('SELECT id, username, role, disabled, password_changed_at FROM users WHERE id = ?')
      .get(decoded.id)
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' })
    }
    if (user.disabled === 1) {
      return res.status(403).json({ error: 'User account is disabled' })
    }

    // Invalidate tokens issued before the most recent password change.
    if (user.password_changed_at && decoded.iat) {
      const changedAt = Math.floor(new Date(user.password_changed_at).getTime() / 1000)
      if (Number.isFinite(changedAt) && decoded.iat < changedAt) {
        return res.status(401).json({ error: 'Token invalidated by password change' })
      }
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
