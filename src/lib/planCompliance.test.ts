import { describe, expect, it } from 'vitest'
import type { PackingDiagnostic } from '../types'
import { assertPlanCompliant, evaluatePlanCompliance } from './planCompliance'

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
      { type: 'overlap', severity: 'error', boxId: 'b1', message: 'boxes overlap' },
      { type: 'overlap', severity: 'error', boxId: 'b1', message: 'boxes overlap again' },
    ])
    expect(compliance.ok).toBe(false)
    expect(compliance.blockers).toEqual([
      expect.objectContaining({ id: 'diagnostic:stacking-check', source: 'diagnostic' }),
      expect.objectContaining({ id: 'manual:overlap:b1', source: 'manual' }),
    ])
    expect(compliance.blockers).toHaveLength(2)
  })

  it('assertPlanCompliant throws a visible error for blocked plans', () => {
    expect(() => assertPlanCompliant(result([
      { id: 'weight-check', severity: 'error', message: 'overweight' },
    ]))).toThrow(/overweight/)
  })
})
