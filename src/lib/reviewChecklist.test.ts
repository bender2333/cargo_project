import { describe, expect, it } from 'vitest'
import { buildReviewChecklist } from './reviewChecklist'
import type { PackingResult } from '../types'

const baseResult: PackingResult = {
  placed: [],
  unplaced: [],
  layers: [],
  workSteps: [],
  labelStats: [],
  diagnostics: [],
  totalCargoCount: 0,
  placedCount: 0,
  usedVolume: 0,
  containerVolume: 1,
  volumeUtilization: 0,
  usedWeight: 0,
  weightUtilization: 0,
}

describe('buildReviewChecklist', () => {
  it('collects field review action items without duplicating compliance diagnostics', () => {
    const checklist = buildReviewChecklist({
      result: {
        ...baseResult,
        unplaced: [{ cargoId: 'c1', label: 'A', name: 'Alpha', quantity: 2, reason: 'No space', reasonCode: 'no-space' }],
        diagnostics: [{ id: 'weight-check', severity: 'error', message: 'Over weight' }],
      },
      measurements: [{
        id: 'm-1',
        from: { kind: 'point', point: { x: 0, y: 0, z: 0 } },
        to: { kind: 'point', point: { x: 100, y: 0, z: 0 } },
        axis: 'x',
        distance: 100,
        locked: true,
        label: 'Door gap',
        hidden: false,
      }],
      cog: { totalWeight: 100, balanced: false, warning: true },
      manualIssues: [{ type: 'overlap', boxId: 'b1', message: 'overlap' }],
      locale: 'en',
    })

    expect(checklist.items.map((item) => item.source)).toEqual([
      'measurement',
      'cog',
      'manual',
      'unplaced',
    ])
    expect(checklist.items.some((item) => item.source === 'diagnostic')).toBe(false)
    expect(checklist.items.find((item) => item.source === 'unplaced')).toEqual(
      expect.objectContaining({
        action: expect.stringContaining('Review'),
        linkedDiagnosticIds: ['weight-check'],
      }),
    )
    expect(checklist.summary.errorCount).toBe(3)
  })
})
