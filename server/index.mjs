import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import db from './db.mjs'
import authRouter from './auth.mjs'
import { authenticate, requireAdmin } from './middleware.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// Behind nginx; trust only the loopback proxy so req.ip resolves to the original client.
app.set('trust proxy', 'loopback')

// Security headers. Static frontend is served by nginx in production, so CSP/HSTS belong there.
// For the API tier we keep the defaults that don't depend on TLS termination here.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}))

// Body parsing with explicit size guard
app.use(express.json({ limit: '2mb' }))

// Log requests (method + url only; never log bodies or headers)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`)
  next()
})

// Rate limit auth endpoints to slow down credential stuffing and registration abuse.
// Values are loose enough for E2E suites and tighten when AUTH_LIMIT_MAX is set in production.
const isProd = process.env.NODE_ENV === 'production'
const AUTH_LIMIT_MAX = Number(process.env.AUTH_LIMIT_MAX) || (isProd ? 30 : 300)
const REGISTER_LIMIT_MAX = Number(process.env.REGISTER_LIMIT_MAX) || (isProd ? 10 : 100)

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: AUTH_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
})
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: REGISTER_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Try again later.' },
}))
app.use('/api/auth/change-password', authLimiter)

function sendServerError(res, scope, err) {
  console.error(`[${scope}]`, err?.message || err)
  res.status(500).json({ error: 'Internal server error' })
}

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
    sendServerError(res, req.path, err)
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
    sendServerError(res, req.path, err)
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
    sendServerError(res, req.path, err)
  }
})

// 3. Custom Container Presets (CRUD)
app.get('/api/containers/custom', authenticate, (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM custom_containers WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
    res.json(list)
  } catch (err) {
    sendServerError(res, req.path, err)
  }
})

app.post('/api/containers/custom', authenticate, (req, res) => {
  const { name, length, width, height, maxWeight, doorGap, topGap, sideGap } = req.body
  if (!name || !length || !width || !height || !maxWeight) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }
  const id = randomUUID()
  try {
    db.prepare(`
      INSERT INTO custom_containers (id, user_id, name, length, width, height, max_weight, door_gap, top_gap, side_gap, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, name, length, width, height, maxWeight, doorGap ?? 0, topGap ?? 0, sideGap ?? 0, new Date().toISOString())
    
    const created = db.prepare('SELECT * FROM custom_containers WHERE id = ?').get(id)
    res.status(201).json(created)
  } catch (err) {
    sendServerError(res, req.path, err)
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
    sendServerError(res, req.path, err)
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
    sendServerError(res, req.path, err)
  }
})

// 4. Excel import templates (user-scoped deterministic mappings)
const TEMPLATE_FIELDS = new Set(['label', 'name', 'length', 'width', 'height', 'weight', 'quantity', 'color', 'canRotate', 'stackable'])
const TEMPLATE_UNITS = new Set(['auto', 'mm', 'cm'])
const TEMPLATE_MERGE_ROWS = new Set(['none', 'by-label'])

function parseTemplatePayload(body) {
  const name = String(body?.name ?? '').trim().slice(0, 80)
  const mapping = body?.mapping && typeof body.mapping === 'object' ? body.mapping : null
  const units = body?.units && typeof body.units === 'object' ? body.units : {}
  const defaults = body?.defaultValues && typeof body.defaultValues === 'object' ? body.defaultValues : {}
  if (!name || !mapping) return null
  const cleanMapping = {}
  for (const [key, value] of Object.entries(mapping)) {
    if (!TEMPLATE_FIELDS.has(key)) continue
    cleanMapping[key] = value == null ? '' : String(value).slice(0, 120)
  }
  const cleanUnits = {}
  for (const key of ['length', 'width', 'height']) {
    const value = String(units[key] ?? 'auto')
    cleanUnits[key] = TEMPLATE_UNITS.has(value) ? value : 'auto'
  }
  const headerRow = Math.max(1, Math.min(50, Math.floor(Number(body?.headerRow ?? 1))))
  const startRow = Math.max(headerRow + 1, Math.min(500, Math.floor(Number(body?.startRow ?? 2))))
  const mergeRows = TEMPLATE_MERGE_ROWS.has(String(body?.mergeRows ?? 'none')) ? String(body?.mergeRows ?? 'none') : 'none'
  const cleanDefaults = {}
  if (defaults.label != null) cleanDefaults.label = String(defaults.label).trim().slice(0, 12)
  if (defaults.name != null) cleanDefaults.name = String(defaults.name).trim().slice(0, 120)
  if (defaults.quantity != null && Number.isFinite(Number(defaults.quantity))) cleanDefaults.quantity = Math.max(1, Math.floor(Number(defaults.quantity)))
  if (defaults.color != null) cleanDefaults.color = String(defaults.color).trim().slice(0, 40)
  if (defaults.canRotate != null) cleanDefaults.canRotate = Boolean(defaults.canRotate)
  if (defaults.stackable != null) cleanDefaults.stackable = Boolean(defaults.stackable)
  return { name, mapping: cleanMapping, units: cleanUnits, headerRow, startRow, mergeRows, defaultValues: cleanDefaults }
}

function serializeTemplate(row) {
  return {
    id: row.id,
    name: row.name,
    mapping: JSON.parse(row.mapping),
    units: JSON.parse(row.units),
    headerRow: row.header_row ?? 1,
    startRow: row.start_row ?? 2,
    mergeRows: row.merge_rows ?? 'none',
    defaultValues: row.defaults ? JSON.parse(row.defaults) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

app.get('/api/import-templates', authenticate, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM import_templates WHERE user_id = ? ORDER BY datetime(updated_at) DESC').all(req.user.id)
    res.json(rows.map(serializeTemplate))
  } catch (err) {
    sendServerError(res, req.path, err)
  }
})

app.post('/api/import-templates', authenticate, (req, res) => {
  const payload = parseTemplatePayload(req.body)
  if (!payload) {
    return res.status(400).json({ error: 'Missing template name or mapping' })
  }
  const id = randomUUID()
  const now = new Date().toISOString()
  try {
    db.prepare(`
      INSERT INTO import_templates (id, user_id, name, mapping, units, header_row, start_row, merge_rows, defaults, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, payload.name, JSON.stringify(payload.mapping), JSON.stringify(payload.units), payload.headerRow, payload.startRow, payload.mergeRows, JSON.stringify(payload.defaultValues), now, now)
    const created = db.prepare('SELECT * FROM import_templates WHERE id = ? AND user_id = ?').get(id, req.user.id)
    res.status(201).json(serializeTemplate(created))
  } catch (err) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Template name already exists' })
    }
    sendServerError(res, req.path, err)
  }
})

app.put('/api/import-templates/:id', authenticate, (req, res) => {
  const payload = parseTemplatePayload(req.body)
  if (!payload) {
    return res.status(400).json({ error: 'Missing template name or mapping' })
  }
  try {
    const existing = db.prepare('SELECT * FROM import_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!existing) {
      return res.status(404).json({ error: 'Template not found or unauthorized' })
    }
    db.prepare(`
      UPDATE import_templates
      SET name = ?, mapping = ?, units = ?, header_row = ?, start_row = ?, merge_rows = ?, defaults = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(payload.name, JSON.stringify(payload.mapping), JSON.stringify(payload.units), payload.headerRow, payload.startRow, payload.mergeRows, JSON.stringify(payload.defaultValues), new Date().toISOString(), req.params.id, req.user.id)
    const updated = db.prepare('SELECT * FROM import_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    res.json(serializeTemplate(updated))
  } catch (err) {
    if (String(err?.message ?? '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Template name already exists' })
    }
    sendServerError(res, req.path, err)
  }
})

app.delete('/api/import-templates/:id', authenticate, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM import_templates WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!existing) {
      return res.status(404).json({ error: 'Template not found or unauthorized' })
    }
    db.prepare('DELETE FROM import_templates WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
    res.json({ message: 'Import template deleted' })
  } catch (err) {
    sendServerError(res, req.path, err)
  }
})

// 5. History Plan Management (CRUD with auto 5-item retention per user!)
app.get('/api/history', authenticate, (req, res) => {
  try {
    const list = db.prepare('SELECT id, project_name, shipment_name, loading_mode, data, created_at FROM history_plans WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
    res.json(list.map(item => ({
      ...item,
      data: JSON.parse(item.data)
    })))
  } catch (err) {
    sendServerError(res, req.path, err)
  }
})

app.post('/api/history', authenticate, (req, res) => {
  const { projectName, shipmentName, loadingMode, data } = req.body
  if (!projectName || !data) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  const id = randomUUID()
  
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
    sendServerError(res, req.path, err)
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
    sendServerError(res, req.path, err)
  }
})

app.delete('/api/history', authenticate, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM history_plans WHERE user_id = ?').run(req.user.id)
    res.json({ deleted: result.changes })
  } catch (err) {
    sendServerError(res, req.path, err)
  }
})

// Admin-only: recent server-side log tail for triage
import fs from 'fs/promises'

const LOG_PATH = process.env.CARGO_LOG_PATH || '/var/log/cargo-server.log'
const SENSITIVE_PATH_PREFIXES = ['/api/auth/']

const debugLogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many log requests. Try again shortly.' },
})

app.get('/api/_debug/recent-logs', debugLogLimiter, authenticate, requireAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? '200'), 10) || 200))
  try {
    const content = await fs.readFile(LOG_PATH, 'utf8')
    const lines = content.split('\n').filter(Boolean)
    const tail = lines.slice(-limit)
      .filter((line) => !SENSITIVE_PATH_PREFIXES.some((prefix) => line.includes(prefix)))
    res.json({ path: LOG_PATH, count: tail.length, lines: tail })
  } catch (err) {
    console.error('[debug-logs]', err?.message || err)
    res.status(500).json({ error: 'Failed to read log' })
  }
})

// Any unknown /api/* returns JSON 404 (does not fall back to index.html)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Serve static frontend files in production
const distPath = path.join(__dirname, '../dist')
app.use(express.static(distPath))

// SPA fallback (non-API paths only — /api is already terminated above)
app.get('*any', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Cargo Server is running on port ${PORT}`)
})
