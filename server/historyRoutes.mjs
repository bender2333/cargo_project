import express from 'express'
import {
  HISTORY_SNAPSHOT_MAX_BYTES,
  assertValidHistoryPlanData,
} from './historySnapshot.mjs'

export const HISTORY_JSON_BODY_LIMIT = 3_000_000
const LOADING_MODES = ['volume', 'weight', 'quantity', 'input']

function assertStoredHistoryMetadata(item) {
  if (typeof item.id !== 'string' || !item.id.trim()) throw new Error('Stored history id is invalid')
  if (typeof item.project_name !== 'string' || !item.project_name.trim()) throw new Error('Stored history project_name is invalid')
  if (item.shipment_name !== null && typeof item.shipment_name !== 'string') throw new Error('Stored history shipment_name is invalid')
  if (!LOADING_MODES.includes(item.loading_mode)) throw new Error('Stored history loading_mode is invalid')
  if (typeof item.created_at !== 'string' || !item.created_at.trim() || Number.isNaN(Date.parse(item.created_at))) {
    throw new Error('Stored history created_at is invalid')
  }
}

export function createHistoryRouter({ db, randomUUID }) {
  const router = express.Router()

  router.get('/', (req, res) => {
    try {
      const list = db.prepare('SELECT id, project_name, shipment_name, loading_mode, data, created_at FROM history_plans WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
      const plans = list.map((item) => {
        assertStoredHistoryMetadata(item)
        const data = JSON.parse(item.data)
        assertValidHistoryPlanData(data)
        return { ...item, data }
      })
      res.json(plans)
    } catch (error) {
      console.error('[GET /api/history]', error?.message || error)
      res.status(500).json({ error: 'Invalid stored history plan' })
    }
  })

  router.post('/', (req, res) => {
    const { projectName, shipmentName, loadingMode, data } = req.body ?? {}
    if (typeof projectName !== 'string' || !projectName.trim() || !data) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }
    if (shipmentName !== undefined && typeof shipmentName !== 'string') {
      return res.status(400).json({ error: 'Invalid shipment name' })
    }
    if (loadingMode !== undefined && !LOADING_MODES.includes(loadingMode)) {
      return res.status(400).json({ error: 'Invalid loading mode' })
    }

    const serialized = JSON.stringify(data)
    if (Buffer.byteLength(serialized, 'utf8') > HISTORY_SNAPSHOT_MAX_BYTES) {
      return res.status(413).json({ error: `History snapshot exceeds ${HISTORY_SNAPSHOT_MAX_BYTES} bytes` })
    }
    try {
      assertValidHistoryPlanData(data)
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid history snapshot' })
    }

    const id = randomUUID()
    try {
      db.prepare(`
        INSERT INTO history_plans (id, user_id, project_name, shipment_name, loading_mode, data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.user.id, projectName, shipmentName || '', loadingMode || 'volume', serialized, new Date().toISOString())

      const all = db.prepare('SELECT id FROM history_plans WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
      if (all.length > 5) {
        const toKeep = all.slice(0, 5).map((item) => item.id)
        const placeholders = toKeep.map(() => '?').join(',')
        db.prepare(`
          DELETE FROM history_plans
          WHERE user_id = ? AND id NOT IN (${placeholders})
        `).run(req.user.id, ...toKeep)
      }

      res.status(201).json({ message: 'History plan saved successfully', id })
    } catch (error) {
      console.error('[POST /api/history]', error?.message || error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.delete('/:id', (req, res) => {
    try {
      const existing = db.prepare('SELECT * FROM history_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
      if (!existing) return res.status(404).json({ error: 'History plan not found or unauthorized' })
      db.prepare('DELETE FROM history_plans WHERE id = ?').run(req.params.id)
      res.json({ message: 'History plan deleted' })
    } catch (error) {
      console.error('[DELETE /api/history/:id]', error?.message || error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  router.delete('/', (req, res) => {
    try {
      const result = db.prepare('DELETE FROM history_plans WHERE user_id = ?').run(req.user.id)
      res.json({ deleted: result.changes })
    } catch (error) {
      console.error('[DELETE /api/history]', error?.message || error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  return router
}
