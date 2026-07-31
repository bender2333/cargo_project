import { describe, expect, it } from 'vitest'
import type { PackingDiagnostic } from '../types'
import { assertPlanCompliant, evaluatePlanCompliance, getActivePlanCompliance } from './planCompliance'

const result = (diagnostics: PackingDiagnostic[]) => ({ diagnostics })

describe('evaluatePlanCompliance', () => {
  it('allows plans with only info/warning diagnostics and non-blocking manual issues', () => {
    const compliance = evaluatePlanCompliance(result([
      { id: 'boundary-check', severity: 'info', message: 'ok' },
      { id: 'support-check', severity: 'warning', message: 'partial' },
    ]), [
      { type: 'floating', severity: 'warning', boxId: 'a', message: 'soft overhang' },
    ])
    expect(compliance.ok).toBe(true)
    expect(compliance.blockers).toEqual([])
  })

  it('blocks automatic error diagnostics and blocking manual issues', () => {
    const compliance = evaluatePlanCompliance(result([
      { id: 'stacking-check', severity: 'error', message: 'stack capacity exceeded' },
    ]), [
      { type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b2', message: 'boxes overlap' },
      { type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b2', message: 'boxes overlap again' },
    ])
    expect(compliance.ok).toBe(false)
    expect(compliance.blockers).toEqual([
      expect.objectContaining({ id: 'diagnostic:stacking-check', source: 'diagnostic' }),
      expect.objectContaining({ id: 'manual:overlap:b1:b2', source: 'manual' }),
    ])
    expect(compliance.blockers).toHaveLength(2)
  })

  it('ignores a hidden invalid manual draft while automatic mode is active', () => {
    const compliance = getActivePlanCompliance({
      mode: 'auto',
      result: result([]),
      manualIssues: [{ type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b2', message: 'boxes overlap' }],
    })

    expect(compliance).toEqual({ mode: 'auto', ok: true, blockers: [] })
  })

  it('blocks the same invalid draft while manual mode is active', () => {
    const compliance = getActivePlanCompliance({
      mode: 'manual',
      result: result([]),
      manualIssues: [{ type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b2', message: 'boxes overlap' }],
    })

    expect(compliance).toEqual({
      mode: 'manual',
      ok: false,
      blockers: [expect.objectContaining({ id: 'manual:overlap:b1:b2', source: 'manual' })],
    })
  })

  it('does not duplicate a manual issue already projected into active result diagnostics', () => {
    const compliance = getActivePlanCompliance({
      mode: 'manual',
      result: result([{ id: 'overlap-check:overlap:b1:b2', severity: 'error', message: 'boxes overlap', source: 'manual', sourceIssueId: 'overlap:b1:b2' }]),
      manualIssues: [{ type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b2', message: 'boxes overlap' }],
    })

    expect(compliance.blockers).toEqual([
      expect.objectContaining({ id: 'diagnostic:overlap-check:overlap:b1:b2', source: 'diagnostic' }),
    ])
  })

  it('keeps distinct same-message manual issues when only one identity was projected', () => {
    const compliance = getActivePlanCompliance({
      mode: 'manual',
      result: result([{ id: 'overlap-check:overlap:b1:b2', severity: 'error', message: 'boxes overlap', source: 'manual', sourceIssueId: 'overlap:b1:b2' }]),
      manualIssues: [
        { type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b2', message: 'boxes overlap' },
        { type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b3', message: 'boxes overlap' },
      ],
    })

    expect(compliance.blockers).toEqual([
      expect.objectContaining({ id: 'diagnostic:overlap-check:overlap:b1:b2', source: 'diagnostic' }),
      expect.objectContaining({ id: 'manual:overlap:b1:b3', source: 'manual' }),
    ])
  })

  it('does not trust an informational manual projection to suppress a blocking issue', () => {
    const compliance = getActivePlanCompliance({
      mode: 'manual',
      result: result([{
        id: 'overlap-check:overlap:b1:b2',
        severity: 'info',
        message: 'overlap check passed',
        source: 'manual',
        sourceIssueId: 'overlap:b1:b2',
      }]),
      manualIssues: [{ type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b2', message: 'boxes overlap' }],
    })

    expect(compliance.blockers).toEqual([
      expect.objectContaining({ id: 'manual:overlap:b1:b2', source: 'manual' }),
    ])
  })

  it('does not infer manual provenance from a non-manual diagnostic id', () => {
    const compliance = getActivePlanCompliance({
      mode: 'manual',
      result: result([{ id: 'overlap-check:overlap:b1:b2', severity: 'error', message: 'boxes overlap' }]),
      manualIssues: [{ type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b2', message: 'boxes overlap' }],
    })

    expect(compliance.blockers).toEqual([
      expect.objectContaining({ id: 'diagnostic:overlap-check:overlap:b1:b2', source: 'diagnostic' }),
      expect.objectContaining({ id: 'manual:overlap:b1:b2', source: 'manual' }),
    ])
  })
  it('encodes sorted issue identities so symmetric pairs cannot collide', () => {
    const compliance = evaluatePlanCompliance(result([]), [
      { type: 'overlap', severity: 'error', boxId: 'a:b', relatedBoxId: 'a%b', message: 'first' },
      { type: 'overlap', severity: 'error', boxId: 'a%b', relatedBoxId: 'a:b', message: 'symmetric duplicate' },
      { type: 'boundary', severity: 'error', boxId: 'a:b', message: 'boundary' },
    ])

    expect(compliance.blockers.map((blocker) => blocker.id)).toEqual([
      'manual:overlap:a%25b:a%3Ab',
      'manual:boundary:a%3Ab',
    ])
  })

  it('localizes active blocker messages for Chinese UI surfaces', () => {
    const compliance = getActivePlanCompliance({
      mode: 'manual',
      locale: 'zh',
      result: result([{ id: 'weight-check', severity: 'error', message: 'Weight check failed' }]),
      manualIssues: [{ type: 'overlap', severity: 'error', boxId: 'b1', relatedBoxId: 'b2', message: 'Boxes overlap' }],
    })

    expect(compliance.blockers.map((blocker) => blocker.message)).toEqual([
      '载重检查失败：已装货物超过最大载重。',
      '与其他货物发生碰撞',
    ])
  })
  it('assertPlanCompliant throws a visible error for a blocked active plan', () => {
    const compliance = getActivePlanCompliance({
      mode: 'auto',
      result: result([{ id: 'weight-check', severity: 'error', message: 'overweight' }]),
      manualIssues: [],
    })

    expect(() => assertPlanCompliant(compliance)).toThrow(/overweight/)
  })
})
