import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import db from './db.mjs'
import authRouter from './auth.mjs'
import { authenticate, requireAdmin } from './middleware.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

// Log requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`)
  next()
})

// 1. Auth routes
app.use('/api/auth', authRouter)

// 2. Admin User management
app.get('/api/users', authenticate, requireAdmin, (req, res) => {
  try {
    // Admin must see ALL users, newest first. No LIMIT — registered users must never be hidden.
    const users = db
      .prepare(
        'SELECT id, username, role, disabled, created_at, last_login_at, last_login_ip FROM users ORDER BY datetime(created_at) DESC'
      )
      .all()
    res.json(users)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/users/:id/toggle-status', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    if (user.username === 'admin') {
      return res.status(400).json({ error: 'Cannot disable the default admin' })
    }
    const nextStatus = user.disabled === 1 ? 0 : 1
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(nextStatus, id)
    res.json({ message: 'User status updated successfully', disabled: nextStatus === 1 })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/users/:id', authenticate, requireAdmin, (req, res) => {
  const { id } = req.params
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }
    if (user.username === 'admin') {
      return res.status(400).json({ error: 'Cannot delete the default admin' })
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
    res.json({ message: 'User deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 3. Custom Container Presets (CRUD)
app.get('/api/containers/custom', authenticate, (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM custom_containers WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
    res.json(list)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/containers/custom', authenticate, (req, res) => {
  const { name, length, width, height, maxWeight, doorGap, topGap, sideGap } = req.body
  if (!name || !length || !width || !height || !maxWeight) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }
  const id = Math.random().toString(36).substring(2) + Date.now().toString(36)
  try {
    db.prepare(`
      INSERT INTO custom_containers (id, user_id, name, length, width, height, max_weight, door_gap, top_gap, side_gap, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, name, length, width, height, maxWeight, doorGap ?? 0, topGap ?? 0, sideGap ?? 0, new Date().toISOString())
    
    const created = db.prepare('SELECT * FROM custom_containers WHERE id = ?').get(id)
    res.status(201).json(created)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/containers/custom/:id', authenticate, (req, res) => {
  const { id } = req.params
  const { name, length, width, height, maxWeight, doorGap, topGap, sideGap } = req.body
  try {
    const existing = db.prepare('SELECT * FROM custom_containers WHERE id = ? AND user_id = ?').get(id, req.user.id)
    if (!existing) {
      return res.status(404).json({ error: 'Container not found or unauthorized' })
    }
    db.prepare(`
      UPDATE custom_containers
      SET name = ?, length = ?, width = ?, height = ?, max_weight = ?, door_gap = ?, top_gap = ?, side_gap = ?
      WHERE id = ?
    `).run(
      name ?? existing.name,
      length ?? existing.length,
      width ?? existing.width,
      height ?? existing.height,
      maxWeight ?? existing.max_weight,
      doorGap ?? existing.door_gap,
      topGap ?? existing.top_gap,
      sideGap ?? existing.side_gap,
      id
    )
    const updated = db.prepare('SELECT * FROM custom_containers WHERE id = ?').get(id)
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/containers/custom/:id', authenticate, (req, res) => {
  const { id } = req.params
  try {
    const existing = db.prepare('SELECT * FROM custom_containers WHERE id = ? AND user_id = ?').get(id, req.user.id)
    if (!existing) {
      return res.status(404).json({ error: 'Container not found or unauthorized' })
    }
    db.prepare('DELETE FROM custom_containers WHERE id = ?').run(id)
    res.json({ message: 'Container preset deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 4. History Plan Management (CRUD with auto 5-item retention per user!)
app.get('/api/history', authenticate, (req, res) => {
  try {
    const list = db.prepare('SELECT id, project_name, shipment_name, loading_mode, data, created_at FROM history_plans WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
    res.json(list.map(item => ({
      ...item,
      data: JSON.parse(item.data)
    })))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/history', authenticate, (req, res) => {
  const { projectName, shipmentName, loadingMode, data } = req.body
  if (!projectName || !data) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  const id = Math.random().toString(36).substring(2) + Date.now().toString(36)
  
  try {
    // Insert new plan
    db.prepare(`
      INSERT INTO history_plans (id, user_id, project_name, shipment_name, loading_mode, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, projectName, shipmentName || '', loadingMode || 'volume', JSON.stringify(data), new Date().toISOString())

    // Enforce 5-item retention: select all plans for this user ordered by date DESC
    const all = db.prepare('SELECT id FROM history_plans WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
    if (all.length > 5) {
      const toKeep = all.slice(0, 5).map(x => x.id)
      const placeholders = toKeep.map(() => '?').join(',')
      db.prepare(`
        DELETE FROM history_plans
        WHERE user_id = ? AND id NOT IN (${placeholders})
      `).run(req.user.id, ...toKeep)
    }

    res.status(201).json({ message: 'History plan saved successfully', id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/history/:id', authenticate, (req, res) => {
  const { id } = req.params
  try {
    const existing = db.prepare('SELECT * FROM history_plans WHERE id = ? AND user_id = ?').get(id, req.user.id)
    if (!existing) {
      return res.status(404).json({ error: 'History plan not found or unauthorized' })
    }
    db.prepare('DELETE FROM history_plans WHERE id = ?').run(id)
    res.json({ message: 'History plan deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Serve static frontend files in production
const distPath = path.join(__dirname, '../dist')
app.use(express.static(distPath))

// Single Page Application routing (fallback to index.html)
app.get('*any', (req, res, next) => {
  if (req.url.startsWith('/api')) {
    return next()
  }
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Cargo Server is running on port ${PORT}`)
})
