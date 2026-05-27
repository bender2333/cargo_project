import type { CogResult } from './centerOfGravity'
import type { MeasurementAnnotation } from './measurement'
import type { ValidationIssue } from './manualPlacement'
import type { Locale, PackingResult } from '../types'

export type ReviewChecklistSource = 'measurement' | 'cog' | 'manual' | 'unplaced' | 'diagnostic'
export type ReviewChecklistSeverity = 'info' | 'warning' | 'error'

export type ReviewChecklistItem = {
  id: string
  source: ReviewChecklistSource
  severity: ReviewChecklistSeverity
  title: string
  detail: string
  action?: string
  linkedDiagnosticIds?: string[]
}

export type ReviewChecklist = {
  items: ReviewChecklistItem[]
  summary: {
    total: number
    errorCount: number
    warningCount: number
  }
}

function text(locale: Locale, zh: string, en: string) {
  return locale === 'zh' ? zh : en
}

export function buildReviewChecklist(input: {
  result: PackingResult
  measurements: MeasurementAnnotation[]
  cog: Pick<CogResult, 'totalWeight' | 'balanced' | 'warning'>
  manualIssues: ValidationIssue[]
  locale: Locale
}): ReviewChecklist {
  const items: ReviewChecklistItem[] = []
  const blockingDiagnosticIds = input.result.diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'info')
    .map((diagnostic) => diagnostic.id)

  input.measurements.filter((item) => !item.hidden).forEach((measurement) => {
    items.push({
      id: `measurement-${measurement.id}`,
      source: 'measurement',
      severity: measurement.stale ? 'warning' : 'info',
      title: measurement.label || text(input.locale, '固定测量线', 'Fixed measurement'),
      detail: `${Math.round(measurement.distance)} mm`,
      action: text(input.locale, '现场按固定测量线复核尺寸。', 'Review this fixed measurement in the field.'),
    })
  })

  if (input.cog.totalWeight > 0) {
    items.push({
      id: 'cog-status',
      source: 'cog',
      severity: input.cog.warning ? 'error' : input.cog.balanced ? 'info' : 'warning',
      title: text(input.locale, '装载重心', 'Center of gravity'),
      detail: input.cog.warning
        ? text(input.locale, '重心超出安全范围，需要复核重货位置。', 'Load center is outside the safe range; review heavy cargo placement.')
        : input.cog.balanced
          ? text(input.locale, '重心处于舒适范围。', 'Load center is within the comfort range.')
          : text(input.locale, '重心接近边界，现场装柜需复核。', 'Load center is close to the limit and needs field review.'),
      action: text(input.locale, '复核重货位置和车辆轴荷风险。', 'Review heavy cargo position and axle-load risk.'),
    })
  }

  input.manualIssues.forEach((issue, index) => {
    items.push({
      id: `manual-${issue.boxId}-${issue.type}-${index}`,
      source: 'manual',
      severity: 'error',
      title: text(input.locale, '手动排布问题', 'Manual placement issue'),
      detail: issue.message,
      action: text(input.locale, '调整该箱体位置或确认现场允许。', 'Adjust this box or confirm the field exception.'),
    })
  })

  input.result.unplaced.forEach((entry) => {
    items.push({
      id: `unplaced-${entry.cargoId}`,
      source: 'unplaced',
      severity: 'error',
      title: text(input.locale, `未装货物 ${entry.label}`, `Unplaced cargo ${entry.label}`),
      detail: `${entry.name} x ${entry.quantity}: ${entry.reason}`,
      action: text(input.locale, '复核是否换柜、拆分装运或调整优先级。', 'Review whether to change container, split shipment, or adjust priority.'),
      linkedDiagnosticIds: blockingDiagnosticIds,
    })
  })

  const errorCount = items.filter((item) => item.severity === 'error').length
  const warningCount = items.filter((item) => item.severity === 'warning').length

  return {
    items,
    summary: {
      total: items.length,
      errorCount,
      warningCount,
    },
  }
}
