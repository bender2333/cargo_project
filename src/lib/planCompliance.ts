import type { PackingDiagnostic, PackingResult } from '../types'
import { isBlockingManualIssue, type ValidationIssue } from './manualPlacement'

export type PlanComplianceBlocker = {
  id: string
  source: 'diagnostic' | 'manual'
  severity: 'error'
  message: string
}

export type PlanCompliance = {
  ok: boolean
  blockers: PlanComplianceBlocker[]
}

function diagnosticBlockers(diagnostics: PackingDiagnostic[]): PlanComplianceBlocker[] {
  return diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => ({
      id: `diagnostic:${diagnostic.id}`,
      source: 'diagnostic' as const,
      severity: 'error' as const,
      message: diagnostic.message,
    }))
}

function manualBlockers(manualIssues: ValidationIssue[]): PlanComplianceBlocker[] {
  const seen = new Set<string>()
  const blockers: PlanComplianceBlocker[] = []
  for (const issue of manualIssues) {
    if (!isBlockingManualIssue(issue)) continue
    const key = `${issue.type}:${issue.boxId}`
    if (seen.has(key)) continue
    seen.add(key)
    blockers.push({
      id: `manual:${key}`,
      source: 'manual',
      severity: 'error',
      message: issue.message,
    })
  }
  return blockers
}

/** Single gate for save/export commands. Errors block; warnings never do. */
export function evaluatePlanCompliance(
  result: Pick<PackingResult, 'diagnostics'>,
  manualIssues: ValidationIssue[] = [],
): PlanCompliance {
  const blockers = [
    ...diagnosticBlockers(result.diagnostics),
    ...manualBlockers(manualIssues),
  ]
  return { ok: blockers.length === 0, blockers }
}

export function assertPlanCompliant(
  result: Pick<PackingResult, 'diagnostics'>,
  manualIssues: ValidationIssue[] = [],
): PlanCompliance {
  const compliance = evaluatePlanCompliance(result, manualIssues)
  if (!compliance.ok) {
    const detail = compliance.blockers.map((blocker) => blocker.message).join('; ')
    throw new Error(detail || 'Plan has blocking compliance issues')
  }
  return compliance
}
