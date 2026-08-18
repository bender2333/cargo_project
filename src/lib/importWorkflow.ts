import type { ImportTemplate, Locale } from '../types'
import type { ImportMappingValue } from './importMapping'
import type { ImportCargoRow } from './importCargo'

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

export function canAutoMap(row: ImportCargoRow): boolean {
  if (Array.isArray(row)) return false
  const keys = Object.keys(row).map(k => k.toLowerCase())
  const fieldsToCheck = {
    length: ['length', '长', '長', '长度', '長度', 'outer_length_mm', '厘米'],
    width: ['width', '宽', '寬', '宽度', '寬度', 'outer_width_mm', '厘米'],
    height: ['height', '高', '高度', 'outer_height_mm', '厘米'],
    weight: ['weight', '重量', '毛重', 'gross_weight_kg'],
    quantity: ['quantity', '数量', '數量', '箱数', '箱數', '托数', '托數', 'carton_count'],
  }
  return Object.values(fieldsToCheck).every(candidates =>
    keys.some(key => candidates.some(cand => key.includes(cand))),
  )
}

export function preSelectCol(fieldKey: string, columns: string[]): string {
  const candidates: Record<string, string[]> = {
    length: ['length', '长', '長', '长度', '長度', 'outer_length_mm'],
    width: ['width', '宽', '寬', '宽度', '寬度', 'outer_width_mm'],
    height: ['height', '高', '高度', 'outer_height_mm'],
    weight: ['weight', '重量', '毛重', 'gross_weight_kg'],
    quantity: ['quantity', '数量', '數量', '箱数', '箱數', '托数', '托數', 'carton_count'],
    name: ['name', '名称', '名稱', '品名', '货物名称', '貨物名稱', 'description'],
    label: ['label', '标签', '標籤', '代码', '代號', '代号', '托盘', '托盤'],
    color: ['color', 'Color', '颜色', '顏色'],
    canRotate: ['canrotate', 'rotate', 'rotation_allowed', '可旋转', '可旋轉', '允许旋转', '允許旋轉'],
    stackable: ['stackable', '可堆叠', '可堆疊', '允许堆叠', '允許堆疊'],
    maxStackLayers: ['maxstacklayers', 'max stack layers', '最大堆叠层数', '最大堆疊層數', '堆叠层数', '堆疊層數'],
    groundOnly: ['groundonly', 'ground only', '必须落地', '落地', '不可上托', '不可堆叠在上'],
  }
  const list = candidates[fieldKey] ?? []
  return columns.find(col => list.some(cand => col.toLowerCase().includes(cand.toLowerCase()))) ?? ''
}

export function preselectMapping(
  columns: string[],
  current: Record<string, string> = {},
): Record<string, string> {
  const next = { ...current }
  IMPORT_REQUIRED_FIELDS.forEach((field) => {
    const mapped = next[field]?.trim() ?? ''
    if (mapped && columns.includes(mapped)) return
    next[field] = preSelectCol(field, columns)
  })
  return next
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

export const IMPORT_REQUIRED_FIELDS = [
  'label', 'name', 'length', 'width', 'height', 'weight', 'quantity',
  'color', 'canRotate', 'stackable', 'maxStackLayers', 'groundOnly', 'dimensions',
] as const
