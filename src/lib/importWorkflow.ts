import type { ImportTemplate, ImportTemplateDefaults, Locale } from '../types'
import type { ImportMappingValue } from './importMapping'

const TEMPLATE_MAPPING_FIELDS = [
  'label', 'name', 'length', 'width', 'height', 'weight', 'quantity',
  'color', 'canRotate', 'stackable', 'maxStackLayers', 'groundOnly',
] as const

const TEMPLATE_DIMENSION_FIELDS = new Set(['length', 'width', 'height'])

const importCodeMessages: Record<Locale, Record<string, string>> = {
  zh: {
    'cm-converted': '第 {row} 行已从厘米换算为毫米。',
    'invalid-dimensions': '第 {row} 行缺少或非法的长宽高。',
    'invalid-quantity': '第 {row} 行缺少或非法的数量。',
    'invalid-weight': '第 {row} 行缺少或非法的重量。',
    'quantity-defaulted': '第 {row} 行未填数量，已默认为 1。',
  },
  en: {
    'cm-converted': 'Row {row}: Centimeter dimensions were converted to millimeters.',
    'invalid-dimensions': 'Row {row}: Missing or invalid length, width, or height.',
    'invalid-quantity': 'Row {row}: Missing or invalid quantity.',
    'invalid-weight': 'Row {row}: Missing or invalid weight.',
    'quantity-defaulted': 'Row {row}: Quantity was missing and defaulted to 1.',
  },
}

function formatTemplate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  )
}

export type ImportIssue = {
  code: string
  params?: Record<string, string | number>
  row: number
  message: string
}

export function translateImportIssue(issue: ImportIssue, locale: Locale): string {
  const tmpl = importCodeMessages[locale]?.[issue.code]
  if (tmpl) return formatTemplate(tmpl, issue.params ?? { row: issue.row })
  return issue.message
}

export function importMappingValueFromTemplate(template: ImportTemplate): ImportMappingValue {
  return {
    mapping: { ...template.mapping, dimensions: template.combinedColumn || template.mapping.dimensions || '' },
    units: {
      length: template.units.length,
      width: template.units.width,
      height: template.units.height,
    },
    headerRow: template.headerRow ?? 1,
    startRow: template.startRow ?? 2,
    dimensionMode: template.dimensionMode ?? 'separate',
    combinedColumn: template.combinedColumn || template.mapping.dimensions || '',
    dimensionOrder: template.dimensionOrder ?? ['length', 'width', 'height'],
    defaults: { quantity: 1, canRotate: true, stackable: true, ...(template.defaultValues ?? {}) },
  }
}

export function mappedColumnsForTemplateValue(value: ImportMappingValue): string[] {
  const columns: string[] = []
  if (value.dimensionMode === 'combined') {
    columns.push(value.combinedColumn || value.mapping.dimensions || '')
  }
  TEMPLATE_MAPPING_FIELDS.forEach((field) => {
    if (value.dimensionMode === 'combined' && TEMPLATE_DIMENSION_FIELDS.has(field)) return
    columns.push(value.mapping[field] ?? '')
  })
  return Array.from(new Set(columns.map(c => c.trim()).filter(Boolean)))
}

export function missingMappedColumns(value: ImportMappingValue, availableColumns: string[]): string[] {
  const present = new Set(availableColumns)
  return mappedColumnsForTemplateValue(value).filter(col => !present.has(col))
}

export type ImportMappingValidation = {
  missingRequired: Array<'length' | 'width' | 'height' | 'combinedColumn' | 'dimensionOrder'>
  duplicateColumns: string[]
  missingColumns: string[]
  valid: boolean
}

const EMPTY_MAPPING_FIELDS = [
  'label', 'name', 'length', 'width', 'height', 'weight', 'quantity',
  'color', 'canRotate', 'stackable', 'maxStackLayers', 'groundOnly', 'dimensions',
] as const

export function emptyImportMappingValue(): ImportMappingValue {
  const mapping: Record<string, string> = {}
  for (const field of EMPTY_MAPPING_FIELDS) mapping[field] = ''
  return {
    mapping,
    units: { length: 'auto', width: 'auto', height: 'auto' },
    headerRow: 1,
    startRow: 2,
    dimensionMode: 'separate',
    combinedColumn: '',
    dimensionOrder: ['length', 'width', 'height'],
    defaults: { quantity: 1, canRotate: true, stackable: true },
  }
}

function isUniqueDimensionOrder(order: ImportMappingValue['dimensionOrder']): boolean {
  return Array.isArray(order)
    && order.length === 3
    && new Set(order).size === 3
    && order.every((field) => TEMPLATE_DIMENSION_FIELDS.has(field))
}


function activeMappedColumns(value: ImportMappingValue): string[] {
  const columns: string[] = []
  if (value.dimensionMode === 'combined') {
    columns.push(value.combinedColumn || value.mapping.dimensions || '')
  }
  for (const field of TEMPLATE_MAPPING_FIELDS) {
    if (value.dimensionMode === 'combined' && TEMPLATE_DIMENSION_FIELDS.has(field)) continue
    columns.push(value.mapping[field] ?? '')
  }
  return columns.map((column) => column.trim()).filter(Boolean)
}

function duplicateActiveColumns(value: ImportMappingValue): string[] {
  const seen = new Map<string, number>()
  for (const column of activeMappedColumns(value)) {
    seen.set(column, (seen.get(column) ?? 0) + 1)
  }
  return Array.from(seen.entries()).filter(([, count]) => count > 1).map(([column]) => column)
}

export function validateImportMappingValue(
  value: ImportMappingValue,
  availableColumns: readonly string[] | null,
): ImportMappingValidation {
  const missingRequired: ImportMappingValidation['missingRequired'] = []
  if (value.dimensionMode === 'combined') {
    if (!(value.combinedColumn || value.mapping.dimensions || '').trim()) {
      missingRequired.push('combinedColumn')
    }
    if (!isUniqueDimensionOrder(value.dimensionOrder)) {
      missingRequired.push('dimensionOrder')
    }
  } else {
    for (const field of ['length', 'width', 'height'] as const) {
      if (!(value.mapping[field] ?? '').trim()) missingRequired.push(field)
    }
  }
  const duplicateColumns = duplicateActiveColumns(value)
  const missingColumns = availableColumns === null
    ? []
    : missingMappedColumns(value, [...availableColumns])
  return {
    missingRequired,
    duplicateColumns,
    missingColumns,
    valid: missingRequired.length === 0 && duplicateColumns.length === 0 && missingColumns.length === 0,
  }
}

function canonicalMapping(mapping: Record<string, string>): Record<string, string> {
  const canonical: Record<string, string> = {}
  for (const key of Object.keys(mapping).sort()) {
    const column = mapping[key]?.trim() ?? ''
    if (column) canonical[key] = column
  }
  return canonical
}

function canonicalDefaults(defaults: ImportTemplateDefaults): ImportTemplateDefaults {
  const canonical: ImportTemplateDefaults = {}
  for (const key of (Object.keys(defaults) as Array<keyof ImportTemplateDefaults>).sort()) {
    if (defaults[key] !== undefined) {
      (canonical as Record<string, unknown>)[key] = defaults[key]
    }
  }
  return canonical
}

export function sameImportMappingValue(
  left: ImportMappingValue,
  right: ImportMappingValue,
): boolean {
  return JSON.stringify({
    mapping: canonicalMapping(left.mapping),
    units: { length: left.units.length, width: left.units.width, height: left.units.height },
    headerRow: left.headerRow,
    startRow: left.startRow,
    dimensionMode: left.dimensionMode,
    combinedColumn: left.combinedColumn.trim(),
    dimensionOrder: left.dimensionOrder,
    defaults: canonicalDefaults(left.defaults),
  }) === JSON.stringify({
    mapping: canonicalMapping(right.mapping),
    units: { length: right.units.length, width: right.units.width, height: right.units.height },
    headerRow: right.headerRow,
    startRow: right.startRow,
    dimensionMode: right.dimensionMode,
    combinedColumn: right.combinedColumn.trim(),
    dimensionOrder: right.dimensionOrder,
    defaults: canonicalDefaults(right.defaults),
  })
}


export type BuildImportMessagesLabels = {
  importSuccess: string
  importMappedFields: string
  importConvertedRows: string
  importSkippedRows: string
  importIssue: string
  importWarning: string
}

export function buildImportMessages(
  result: {
    summary: { importedRows: number; mappedFields: string[]; convertedCentimeterRows: number; skippedRows: number }
    errors: ImportIssue[]
    warnings: ImportIssue[]
  },
  labels: BuildImportMessagesLabels,
  locale: Locale,
): string[] {
  return [
    `${labels.importSuccess}: ${result.summary.importedRows}`,
    `${labels.importMappedFields}: ${result.summary.mappedFields.join(', ') || '-'}`,
    `${labels.importConvertedRows}: ${result.summary.convertedCentimeterRows}`,
    `${labels.importSkippedRows}: ${result.summary.skippedRows}`,
    ...result.errors.map(issue => `${labels.importIssue} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
    ...result.warnings.map(issue => `${labels.importWarning} row ${issue.row}: ${translateImportIssue(issue, locale)}`),
  ]
}


