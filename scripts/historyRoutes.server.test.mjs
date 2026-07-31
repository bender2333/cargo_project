import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import Database from 'better-sqlite3'
import { validHistorySnapshot, validLegacyHistorySnapshot, validManualHistorySnapshot } from './historySnapshot.fixture.mjs'
import {
  HISTORY_JSON_BODY_LIMIT,
  createHistoryRouter,
} from '../server/historyRoutes.mjs'

let db
let server
let baseUrl

beforeEach(async () => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE history_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      shipment_name TEXT,
      loading_mode TEXT,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  const app = express()
  app.use(express.json({ limit: HISTORY_JSON_BODY_LIMIT }))
  app.use((req, _res, next) => {
    req.user = { id: 'user-1' }
    next()
  })
  app.use('/api/history', createHistoryRouter({ db, randomUUID: () => 'new-plan' }))
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}/api/history`
})

afterEach(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  db.close()
})

async function post(data) {
  return fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectName: 'Project', shipmentName: 'Shipment', loadingMode: 'volume', data }),
  })
}

describe('history routes', () => {
  it('round-trips a valid v2 snapshot', async () => {
    const snapshot = validHistorySnapshot()
    expect((await post(snapshot)).status).toBe(201)
    const response = await fetch(baseUrl)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([expect.objectContaining({ id: 'new-plan', data: snapshot })])
  })

  it('stores legitimate legacy input for confirmed recompute', async () => {
    const legacy = validLegacyHistorySnapshot()
    expect((await post(legacy)).status).toBe(201)
    const response = await fetch(baseUrl)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([expect.objectContaining({ data: legacy })])
  })

  it('returns 400 before invalid POST data inserts or triggers retention eviction', async () => {
    for (let index = 0; index < 5; index += 1) {
      db.prepare('INSERT INTO history_plans VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        `existing-${index}`, 'user-1', `Existing ${index}`, '', 'volume', JSON.stringify(validHistorySnapshot()), `2026-07-3${index}T00:00:00.000Z`,
      )
    }
    const invalid = validHistorySnapshot()
    invalid.packingResult.workSteps[0].boxId = 'missing'

    const response = await post(invalid)

    expect(response.status).toBe(400)
    const manualMismatch = validManualHistorySnapshot()
    manualMismatch.manualDraft.boxes[0].x += 1
    expect((await post(manualMismatch)).status).toBe(400)
    const legacyWithResult = validHistorySnapshot()
    delete legacyWithResult.schemaVersion
    delete legacyWithResult.placementMode
    legacyWithResult.packingResult = validHistorySnapshot().packingResult
    expect((await post(legacyWithResult)).status).toBe(400)
    expect(db.prepare('SELECT id FROM history_plans ORDER BY id').all()).toEqual([
      { id: 'existing-0' }, { id: 'existing-1' }, { id: 'existing-2' }, { id: 'existing-3' }, { id: 'existing-4' },
    ])
  })

  it('rejects malformed stored GET rows visibly', async () => {
    db.prepare('INSERT INTO history_plans VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'damaged', 'user-1', 'Damaged', '', 'volume', JSON.stringify({ schemaVersion: 2 }), '2026-07-31T00:00:00.000Z',
    )

    const response = await fetch(baseUrl)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Invalid stored history plan' })
  })

  it('rejects valid snapshots with malformed stored row metadata', async () => {
    const cases = [
      { id: '', projectName: 'Project', shipmentName: '', loadingMode: 'volume', createdAt: '2026-07-31T00:00:00.000Z' },
      { id: 'bad-project', projectName: '', shipmentName: '', loadingMode: 'volume', createdAt: '2026-07-31T00:00:00.000Z' },
      { id: 'bad-mode', projectName: 'Project', shipmentName: '', loadingMode: 'bogus', createdAt: '2026-07-31T00:00:00.000Z' },
      { id: 'bad-date', projectName: 'Project', shipmentName: '', loadingMode: 'volume', createdAt: 'not-a-date' },
    ]
    for (const row of cases) {
      db.exec('DELETE FROM history_plans')
      db.prepare('INSERT INTO history_plans VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        row.id,
        'user-1',
        row.projectName,
        row.shipmentName,
        row.loadingMode,
        JSON.stringify(validHistorySnapshot()),
        row.createdAt,
      )

      const response = await fetch(baseUrl)
      expect(response.status, row.id || 'empty id').toBe(500)
      expect(await response.json()).toEqual({ error: 'Invalid stored history plan' })
    }
  })

  it('lets the domain guard return 413 before the parser rejects the request', async () => {
    expect(HISTORY_JSON_BODY_LIMIT).toBeGreaterThan(2_500_000)
    const oversized = validHistorySnapshot()
    oversized.cargoItems[0].name = 'x'.repeat(2_500_000)

    const response = await post(oversized)
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'History snapshot exceeds 2500000 bytes' })
  })
})
