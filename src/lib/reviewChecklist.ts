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

  input.measurements.filter((item) => !item.hidden).forEach((measurement) => {
    items.push({
      id: `measurement-${measurement.id}`,
      source: 'measurement',
      severity: measurement.stale ? 'warning' : 'info',
      title: measurement.label || text(input.locale, '固定测量线', 'Fixed measurement'),
      detail: `${Math.round(measurement.distance)} mm`,
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
    })
  }

  input.manualIssues.forEach((issue, index) => {
    items.push({
      id: `manual-${issue.boxId}-${issue.type}-${index}`,
      source: 'manual',
      severity: 'error',
      title: text(input.locale, '手动排布问题', 'Manual placement issue'),
      detail: issue.message,
    })
  })

  input.result.unplaced.forEach((entry) => {
    items.push({
      id: `unplaced-${entry.cargoId}`,
      source: 'unplaced',
      severity: 'error',
      title: text(input.locale, `未装货物 ${entry.label}`, `Unplaced cargo ${entry.label}`),
      detail: `${entry.name} x ${entry.quantity}: ${entry.reason}`,
    })
  })

  input.result.diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'info')
    .forEach((diagnostic) => {
      items.push({
        id: `diagnostic-${diagnostic.id}`,
        source: 'diagnostic',
        severity: diagnostic.severity,
        title: text(input.locale, '合规诊断', 'Compliance diagnostic'),
        detail: diagnostic.message,
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
