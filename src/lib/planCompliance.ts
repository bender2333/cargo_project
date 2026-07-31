import type { Locale, PackingDiagnostic, PackingResult } from '../types'
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

export type ActivePlanCompliance = PlanCompliance & {
  mode: 'auto' | 'manual'
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

export function manualIssueIdentity(issue: ValidationIssue): string {
  if (issue.type === 'overlap') {
    const [firstId, secondId] = [issue.boxId, issue.relatedBoxId].sort()
    return `overlap:${encodeURIComponent(firstId)}:${encodeURIComponent(secondId)}`
  }
  return `${issue.type}:${encodeURIComponent(issue.boxId)}`
}

const zhManualBlockerMessages: Record<string, string> = {
  boundary: '超出有效货柜边界',
  overlap: '与其他货物发生碰撞',
  floating: '处于悬空状态，底面至少需要 50% 支撑',
  'rotation-disabled': '该货物禁止旋转',
  stacking: '堆叠在不可堆叠货物上',
  'max-stack-layers': '超过最大堆叠层数',
  'ground-only': '落地货物不能放在其他货物上方',
  overweight: '超过货柜最大载重',
}

const zhDiagnosticBlockerMessages: Record<string, string> = {
  'boundary-check': '边界检查失败：至少一个已装箱体超出有效货柜。',
  'weight-check': '载重检查失败：已装货物超过最大载重。',
  'overlap-check': '重叠检查失败：至少一组已装箱体发生重叠。',
  'support-check': '支撑检查失败：堆叠货物缺少明确支撑。',
  'stacking-check': '堆叠检查失败：货物被放在不可堆叠项目上。',
}

export function localizePlanComplianceBlocker(blocker: PlanComplianceBlocker, locale: Locale): string {
  if (locale === 'en') return blocker.message
  const prefix = blocker.source === 'manual' ? 'manual:' : 'diagnostic:'
  const key = blocker.id.startsWith(prefix) ? blocker.id.slice(prefix.length).split(':', 1)[0] : ''
  return blocker.source === 'manual'
    ? zhManualBlockerMessages[key] ?? '存在手动校验阻塞问题'
    : zhDiagnosticBlockerMessages[key] ?? '存在未通过的合规检查'
}

export function formatPlanComplianceMessage(compliance: Pick<PlanCompliance, 'ok' | 'blockers'>, locale: Locale): string | null {
  return compliance.ok ? null : compliance.blockers.map((blocker) => localizePlanComplianceBlocker(blocker, locale)).join('; ')
}

function manualBlockers(manualIssues: ValidationIssue[]): PlanComplianceBlocker[] {
  const seen = new Set<string>()
  const blockers: PlanComplianceBlocker[] = []
  for (const issue of manualIssues) {
    if (!isBlockingManualIssue(issue)) continue
    const key = manualIssueIdentity(issue)
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

export function getActivePlanCompliance(input: {
  mode: ActivePlanCompliance['mode']
  result: Pick<PackingResult, 'diagnostics'>
  manualIssues: ValidationIssue[]
  locale?: Locale
}): ActivePlanCompliance {
  const projectedManualIssueIds = new Set(
    input.result.diagnostics.flatMap((diagnostic) => (
      diagnostic.source === 'manual' && diagnostic.severity === 'error'
        ? [diagnostic.sourceIssueId]
        : []
    )),
  )
  const activeManualIssues = input.mode === 'manual'
    ? input.manualIssues.filter((issue) => !projectedManualIssueIds.has(manualIssueIdentity(issue)))
    : []
  const compliance = evaluatePlanCompliance(input.result, activeManualIssues)
  return {
    mode: input.mode,
    ...compliance,
    blockers: input.locale
      ? compliance.blockers.map((blocker) => ({ ...blocker, message: localizePlanComplianceBlocker(blocker, input.locale!) }))
      : compliance.blockers,
  }
}

export function assertPlanCompliant(compliance: ActivePlanCompliance): ActivePlanCompliance {
  if (!compliance.ok) {
    const detail = compliance.blockers.map((blocker) => blocker.message).join('; ')
    throw new Error(detail || 'Plan has blocking compliance issues')
  }
  return compliance
}
