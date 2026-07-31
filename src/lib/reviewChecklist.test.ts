import { describe, expect, it } from 'vitest'
import { buildReviewChecklist } from './reviewChecklist'
import { buildManualPackingResult } from './manualSteps'
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
  it('includes non-info diagnostics as first-class review items', () => {
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
      locale: 'en',
    })

    expect(checklist.items.map((item) => item.source)).toEqual(['measurement', 'cog', 'diagnostic', 'unplaced'])
    expect(checklist.items.find((item) => item.source === 'diagnostic')).toEqual(
      expect.objectContaining({ severity: 'error', detail: 'Over weight', linkedDiagnosticIds: ['weight-check'] }),
    )
    expect(checklist.items.find((item) => item.source === 'unplaced')).toEqual(
      expect.objectContaining({ action: expect.stringContaining('Review'), linkedDiagnosticIds: ['weight-check'] }),
    )
    expect(checklist.summary.errorCount).toBe(3)
  })

  it('localizes diagnostic and unplaced details in Chinese', () => {
    const checklist = buildReviewChecklist({
      result: {
        ...baseResult,
        diagnostics: [{ id: 'weight-check', severity: 'error', message: 'Weight check failed' }],
        unplaced: [{ cargoId: 'c1', label: 'A', name: 'Alpha', quantity: 2, reason: 'No space', reasonCode: 'no-space' }],
      },
      measurements: [],
      cog: { totalWeight: 0, balanced: true, warning: false },
      locale: 'zh',
    })

    expect(checklist.items.find((item) => item.source === 'diagnostic')?.detail).toContain('载重检查失败')
    expect(checklist.items.find((item) => item.source === 'unplaced')?.detail).toContain('没有剩余装载空间')
    expect(checklist.items.map((item) => item.detail).join(' ')).not.toContain('Weight check failed')
  })

  it('preserves actionable Chinese optimization diagnostic text', () => {
    const checklist = buildReviewChecklist({
      result: {
        ...baseResult,
        diagnostics: [{ id: 'optimization-suggestion', severity: 'warning', message: 'Optimization suggestion: review unplaced cargo.' }],
      },
      measurements: [],
      cog: { totalWeight: 0, balanced: true, warning: false },
      locale: 'zh',
    })

    expect(checklist.items[0].detail).toContain('优化建议')
    expect(checklist.items[0].detail).toContain('检查未装入货物')
  })

  it('projects one manual overlap to one authoritative diagnostic and checklist error', () => {
    const issue = { type: 'overlap' as const, boxId: 'b1', relatedBoxId: 'b2', severity: 'error' as const, message: 'overlap' }
    const result = buildManualPackingResult([], {
      id: 'container',
      label: 'Container',
      description: '',
      length: 1000,
      width: 1000,
      height: 1000,
      maxWeight: 1000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }, [], [issue])
    const checklist = buildReviewChecklist({
      result,
      measurements: [],
      cog: { totalWeight: 0, balanced: true, warning: false },
      locale: 'en',
    })

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        id: 'overlap-check:overlap:b1:b2',
        code: 'overlap-check',
        source: 'manual',
        sourceIssueId: 'overlap:b1:b2',
        severity: 'error',
      }),
    ])
    expect(checklist.items).toEqual([
      expect.objectContaining({ id: 'diagnostic-overlap-check:overlap:b1:b2', source: 'manual', severity: 'error' }),
    ])
    expect(new Set(checklist.items.map((item) => item.id)).size).toBe(checklist.items.length)
    expect(checklist.summary).toEqual({ total: 1, errorCount: 1, warningCount: 0 })
  })

  it('deduplicates the two symmetric issues for one overlapping pair', () => {
    const issues = [
      { type: 'overlap' as const, boxId: 'b1', relatedBoxId: 'b2', severity: 'error' as const, message: 'overlap' },
      { type: 'overlap' as const, boxId: 'b2', relatedBoxId: 'b1', severity: 'error' as const, message: 'overlap' },
    ]
    const result = buildManualPackingResult([], {
      id: 'container',
      label: 'Container',
      description: '',
      length: 1000,
      width: 1000,
      height: 1000,
      maxWeight: 1000,
      doorGap: 0,
      topGap: 0,
      sideGap: 0,
    }, [], issues)
    const checklist = buildReviewChecklist({
      result,
      measurements: [],
      cog: { totalWeight: 0, balanced: true, warning: false },
      locale: 'en',
    })

    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toEqual(['overlap-check:overlap:b1:b2'])
    expect(checklist.items.map((item) => item.id)).toEqual(['diagnostic-overlap-check:overlap:b1:b2'])
    expect(checklist.summary).toEqual({ total: 1, errorCount: 1, warningCount: 0 })
  })

  it('keeps two overlap identities for one box with two counterparts', () => {
    const issues = [
      { type: 'overlap' as const, boxId: 'b1', relatedBoxId: 'b2', severity: 'error' as const, message: 'overlap' },
      { type: 'overlap' as const, boxId: 'b1', relatedBoxId: 'b3', severity: 'error' as const, message: 'overlap' },
    ]
    const result = buildManualPackingResult([], {
      id: 'container', label: 'Container', description: '',
      length: 1000, width: 1000, height: 1000, maxWeight: 1000,
      doorGap: 0, topGap: 0, sideGap: 0,
    }, [], issues)
    const checklist = buildReviewChecklist({
      result,
      measurements: [],
      cog: { totalWeight: 0, balanced: true, warning: false },
      locale: 'en',
    })

    expect(result.diagnostics.map((diagnostic) => diagnostic.id)).toEqual([
      'overlap-check:overlap:b1:b2',
      'overlap-check:overlap:b1:b3',
    ])
    expect(checklist.items.map((item) => item.id)).toEqual([
      'diagnostic-overlap-check:overlap:b1:b2',
      'diagnostic-overlap-check:overlap:b1:b3',
    ])
    expect(checklist.summary).toEqual({ total: 2, errorCount: 2, warningCount: 0 })
  })
})
