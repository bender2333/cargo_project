import type { CargoItem, ImportTemplateDefaults } from '../types'
import { createClientId } from './clientId'
import { excelStyleLabel } from './excelStyleLabel'

type RowValue = string | number | boolean | null | undefined
export type ImportCargoRow = Record<string, RowValue> | RowValue[]

export const IMPORT_CODES = {
  CM_CONVERTED: 'cm-converted',
  INVALID_DIMENSIONS: 'invalid-dimensions',
  INVALID_QUANTITY: 'invalid-quantity',
  QUANTITY_DEFAULTED: 'quantity-defaulted',
} as const

export type ImportCargoCode = (typeof IMPORT_CODES)[keyof typeof IMPORT_CODES]

export type ImportCargoIssue = {
  row: number
  /** Structured code for localized rendering. */
  code: string
  /** Optional parameters that vary the rendered message (e.g., row, value). */
  params?: Record<string, string | number>
  /** English fallback message retained for backwards compatibility. */
  message: string
}

export type ImportCargoResult = {
  items: CargoItem[]
  errors: ImportCargoIssue[]
  warnings: ImportCargoIssue[]
  summary: {
    importedRows: number
    mappedFields: string[]
    convertedCentimeterRows: number
    skippedRows: number
  }
}

type ParseOptions = {
  createId?: () => string
  colors?: string[]
}

export type ImportTemplateConfig = {
  mapping: Record<string, string>
  units?: Partial<Record<'length' | 'width' | 'height', 'auto' | 'mm' | 'cm'>>
  headerRow?: number
  startRow?: number
  mergeRows?: 'none' | 'by-label'
  defaultValues?: ImportTemplateDefaults
  dimensionMode?: 'separate' | 'combined'
  combinedColumn?: string
  dimensionOrder?: Array<'length' | 'width' | 'height'>
}

const defaultColors = ['#f59e0b', '#0ea5e9', '#22c55e', '#ef4444', '#8b5cf6', '#14b8a6']

const fields = {
  label: ['label', 'Label', '标签', '標籤', '托盘', '托盤', '代码', '代號'],
  name: ['name', 'Name', 'description', 'Description', '名称', '名稱', '货物名称', '貨物名稱', '品名', '产品名称', '產品名稱'],
  lengthMm: ['length', 'Length', 'Length mm', 'length mm', '长', '長', '长mm', '長mm', '长度', '長度', 'outer_length_mm'],
  lengthCm: ['Length cm', 'length cm', '长cm', '長cm', '长度cm', '長度cm'],
  widthMm: ['width', 'Width', 'Width mm', 'width mm', '宽', '寬', '宽mm', '寬mm', '宽度', '寬度', 'outer_width_mm'],
  widthCm: ['Width cm', 'width cm', '宽cm', '寬cm', '宽度cm', '寬度cm'],
  heightMm: ['height', 'Height', 'Height mm', 'height mm', '高', '高mm', '高度', '高度mm', 'outer_height_mm'],
  heightCm: ['Height cm', 'height cm', '高cm', '高度cm'],
  weight: ['weight', 'Weight', 'Weight kg', 'weight kg', '重量', '重量kg', '整托重量kg', '毛重kg', 'gross_weight_kg'],
  quantity: ['quantity', 'Quantity', '数量', '數量', '箱数', '箱數', '托数', '托數', 'carton_count'],
  color: ['color', 'Color', '颜色', '顏色'],
  canRotate: ['canRotate', 'Rotate', 'rotation_allowed', '可旋转', '可旋轉', '允许旋转', '允許旋轉'],
  stackable: ['stackable', 'Stackable', '可堆叠', '可堆疊', '允许堆叠', '允許堆疊'],
  maxStackLayers: ['maxStackLayers', 'max stack layers', 'Max stack layers', '最大堆叠层数', '最大堆疊層數', '堆叠层数', '堆疊層數'],
}

const summaryRowPattern = /^(汇总|合计|小计|total|合計)$/i

function valueFor(row: Record<string, RowValue>, candidates: string[]) {
  for (const key of candidates) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return undefined
}

function hasValueFor(row: Record<string, RowValue>, candidates: string[]) {
  return valueFor(row, candidates) !== undefined
}

function numberValue(value: RowValue) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function positiveNumber(row: Record<string, RowValue>, mmKeys: string[], cmKeys: string[]) {
  const mm = numberValue(valueFor(row, mmKeys))
  if (mm > 0) {
    return { value: mm, convertedFromCm: false }
  }

  const cm = numberValue(valueFor(row, cmKeys))
  if (cm > 0) {
    return { value: cm * 10, convertedFromCm: true }
  }

  return { value: 0, convertedFromCm: false }
}

function boolValue(value: RowValue, fallback: boolean) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback
  }
  const normalized = String(value).trim().toLowerCase()
  if (['false', '0', 'no', 'n', '否', '不', '不可', '不能'].includes(normalized)) {
    return false
  }
  if (['true', '1', 'yes', 'y', '是', '可', '允许', '允許'].includes(normalized)) {
    return true
  }
  return fallback
}

function fallbackLabel(index: number) {
  return excelStyleLabel(index)
}

function sanitizeText(value: RowValue, maxLength: number) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\x00-\x1F<>]/g, '').trim().slice(0, maxLength)
}

function isObjectRow(row: ImportCargoRow): row is Record<string, RowValue> {
  return !Array.isArray(row) && row !== null && typeof row === 'object'
}

function normalizeObjectRows(rows: ImportCargoRow[]): Record<string, RowValue>[] {
  return rows.filter(isObjectRow)
}

function isSummaryRow(row: Record<string, RowValue>) {
  const nameValue = valueFor(row, fields.name)
  const labelValue = valueFor(row, fields.label)
  return [nameValue, labelValue].some((value) => summaryRowPattern.test(String(value ?? '').trim()))
}

export function parseCargoRows(rows: ImportCargoRow[], options: ParseOptions = {}): ImportCargoResult {
  const colors = options.colors ?? defaultColors
  const createId = options.createId ?? createClientId
  const errors: ImportCargoIssue[] = []
  const warnings: ImportCargoIssue[] = []
  const items: CargoItem[] = []
  const mappedFields = new Set<string>()
  let convertedCentimeterRows = 0
  let skippedRows = 0

  normalizeObjectRows(rows).forEach((row, index) => {
    const rowNumber = index + 2
    if (isSummaryRow(row)) {
      skippedRows += 1
      return
    }

    const length = positiveNumber(row, fields.lengthMm, fields.lengthCm)
    const width = positiveNumber(row, fields.widthMm, fields.widthCm)
    const height = positiveNumber(row, fields.heightMm, fields.heightCm)
    const convertedFromCm = length.convertedFromCm || width.convertedFromCm || height.convertedFromCm

    if (length.value <= 0 || width.value <= 0 || height.value <= 0) {
      const hasAnyDimensionValue = [
        valueFor(row, [...fields.lengthMm, ...fields.lengthCm]),
        valueFor(row, [...fields.widthMm, ...fields.widthCm]),
        valueFor(row, [...fields.heightMm, ...fields.heightCm]),
      ].some((value) => value !== undefined)
      const allEmpty = Object.values(row).every((value) => value === undefined || value === null || String(value).trim() === '')
      if (allEmpty || !hasAnyDimensionValue) {
        skippedRows += 1
        return
      }
      errors.push({
        row: rowNumber,
        code: IMPORT_CODES.INVALID_DIMENSIONS,
        params: { row: rowNumber },
        message: 'Missing or invalid length, width, or height.',
      })
      return
    }

    const rawQuantity = valueFor(row, fields.quantity)
    const quantity = rawQuantity === undefined ? 1 : Math.floor(numberValue(rawQuantity))
    if (quantity <= 0) {
      errors.push({
        row: rowNumber,
        code: IMPORT_CODES.INVALID_QUANTITY,
        params: { row: rowNumber },
        message: 'Missing or invalid quantity.',
      })
      return
    }

    if (rawQuantity === undefined) {
      warnings.push({
        row: rowNumber,
        code: IMPORT_CODES.QUANTITY_DEFAULTED,
        params: { row: rowNumber },
        message: 'Quantity was missing and defaulted to 1.',
      })
    }

    if (convertedFromCm) {
      warnings.push({
        row: rowNumber,
        code: IMPORT_CODES.CM_CONVERTED,
        params: { row: rowNumber },
        message: 'Centimeter dimensions were converted to millimeters.',
      })
      convertedCentimeterRows += 1
    }

    const fieldMappings: Array<{ field: string; candidates: string[] }> = [
      { field: 'label', candidates: fields.label },
      { field: 'name', candidates: fields.name },
      { field: 'length', candidates: [...fields.lengthMm, ...fields.lengthCm] },
      { field: 'width', candidates: [...fields.widthMm, ...fields.widthCm] },
      { field: 'height', candidates: [...fields.heightMm, ...fields.heightCm] },
      { field: 'weight', candidates: fields.weight },
      { field: 'quantity', candidates: fields.quantity },
      { field: 'color', candidates: fields.color },
      { field: 'canRotate', candidates: fields.canRotate },
      { field: 'stackable', candidates: fields.stackable },
      { field: 'maxStackLayers', candidates: fields.maxStackLayers },
    ]

    fieldMappings.forEach(({ field, candidates }) => {
      if (hasValueFor(row, candidates)) {
        mappedFields.add(field)
      }
    })

    const label = sanitizeText(valueFor(row, fields.label), 80) || fallbackLabel(index)
    const name = sanitizeText(valueFor(row, fields.name) ?? `Cargo ${index + 1}`, 200)
    const rawColor = String(valueFor(row, fields.color) ?? colors[index % colors.length])
    const colorPattern = /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%/]+\)$|^[a-z]{3,30}$/i
    const color = colorPattern.test(rawColor.trim()) ? rawColor.trim() : colors[index % colors.length]

    items.push({
      id: createId(),
      label,
      name,
      length: length.value,
      width: width.value,
      height: height.value,
      weight: numberValue(valueFor(row, fields.weight)),
      quantity,
      color,
      canRotate: boolValue(valueFor(row, fields.canRotate), true),
      stackable: boolValue(valueFor(row, fields.stackable), true),
      maxStackLayers: numberValue(valueFor(row, fields.maxStackLayers)) > 0 ? Math.floor(numberValue(valueFor(row, fields.maxStackLayers))) : undefined,
    })
  })

  return {
    items,
    errors,
    warnings,
    summary: {
      importedRows: items.length,
      mappedFields: [...mappedFields].sort(),
      convertedCentimeterRows,
      skippedRows,
    },
  }
}

export function parseCargoRowsWithMapping(
  rows: ImportCargoRow[],
  mapping: Record<string, string>,
  options: ParseOptions = {}
): ImportCargoResult {
  const virtualRows = normalizeObjectRows(rows).map((row) => {
    const virtualRow: Record<string, RowValue> = {}
    
    Object.entries(mapping).forEach(([fieldKey, colName]) => {
      if (!colName) return
      const value = row[colName]
      if (value === undefined || value === null) return

      if (fieldKey === 'length') {
        const isCm = colName.toLowerCase().includes('cm') || colName.includes('厘米')
        virtualRow[isCm ? 'Length cm' : 'length'] = value
      } else if (fieldKey === 'width') {
        const isCm = colName.toLowerCase().includes('cm') || colName.includes('厘米')
        virtualRow[isCm ? 'Width cm' : 'width'] = value
      } else if (fieldKey === 'height') {
        const isCm = colName.toLowerCase().includes('cm') || colName.includes('厘米')
        virtualRow[isCm ? 'Height cm' : 'height'] = value
      } else if (fieldKey === 'dimensions') {
        virtualRow.dimensions = value
      } else {
        virtualRow[fieldKey] = value
      }
    })
    
    return virtualRow
  })

  return parseCargoRows(virtualRows, options)
}

function matrixRowsToObjectRows(rows: ImportCargoRow[], template: ImportTemplateConfig): Record<string, RowValue>[] {
  if (!rows.some(Array.isArray)) return normalizeObjectRows(rows)
  const headerIndex = Math.max(0, Math.floor((template.headerRow ?? 1) - 1))
  const startIndex = Math.max(headerIndex + 1, Math.floor((template.startRow ?? headerIndex + 2) - 1))
  const header = Array.isArray(rows[headerIndex]) ? rows[headerIndex] : []
  return rows.slice(startIndex).filter(Array.isArray).map((row) => {
    const next: Record<string, RowValue> = {}
    header.forEach((cell, index) => {
      const key = String(cell ?? '').trim()
      if (!key) return
      next[key] = row[index]
    })
    return next
  })
}

function splitCombinedDimensions(value: RowValue): [number, number, number] | null {
  const parts = String(value ?? '')
    .trim()
    .split(/\s*[xX*＊×]\s*|\s+/)
    .filter(Boolean)
    .map((part) => Number(String(part).replace(',', '.')))
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part) || part <= 0)) return null
  return [parts[0], parts[1], parts[2]]
}

function dimensionUnitMultiplier(template: ImportTemplateConfig, columnName: string) {
  const explicit = template.units?.length ?? template.units?.width ?? template.units?.height ?? 'auto'
  if (explicit === 'cm') return 10
  if (explicit === 'mm') return 1
  const normalized = columnName.toLowerCase()
  if (normalized.includes('cm') || columnName.includes('厘米')) return 10
  return 1
}

export function parseCargoRowsWithTemplate(
  rows: ImportCargoRow[],
  template: ImportTemplateConfig,
  options: ParseOptions = {},
): ImportCargoResult {
  const dimensionFields: Array<'length' | 'width' | 'height'> = ['length', 'width', 'height']
  const effectiveMapping: Record<string, string> = { ...template.mapping }
  const objectRows = matrixRowsToObjectRows(rows, template)
  const startIndex = rows.some(Array.isArray) ? 0 : Math.max(0, Math.floor((template.startRow ?? 2) - 2))
  const defaults = template.defaultValues ?? {}
  const effectiveRows = objectRows.slice(startIndex).map((row) => {
    const next: Record<string, RowValue> = { ...row }
    const applyDefault = (field: keyof ImportTemplateDefaults, key: string, value: RowValue) => {
      const mapped = template.mapping[field]
      if (mapped) {
        if (next[mapped] === undefined || next[mapped] === null || String(next[mapped]).trim() === '') {
          next[mapped] = value
        }
      } else {
        next[key] = value
      }
    }
    if (defaults.label) applyDefault('label', '__default_label', defaults.label)
    if (defaults.name) applyDefault('name', '__default_name', defaults.name)
    if (defaults.quantity !== undefined) applyDefault('quantity', '__default_quantity', defaults.quantity)
    if (defaults.color) applyDefault('color', '__default_color', defaults.color)
    if (defaults.canRotate !== undefined) applyDefault('canRotate', '__default_canRotate', defaults.canRotate)
    if (defaults.stackable !== undefined) applyDefault('stackable', '__default_stackable', defaults.stackable)
    if (defaults.maxStackLayers !== undefined) applyDefault('maxStackLayers', '__default_maxStackLayers', defaults.maxStackLayers)
    return next
  })
  if (defaults.label && !effectiveMapping.label) effectiveMapping.label = '__default_label'
  if (defaults.name && !effectiveMapping.name) effectiveMapping.name = '__default_name'
  if (defaults.quantity !== undefined && !effectiveMapping.quantity) effectiveMapping.quantity = '__default_quantity'
  if (defaults.color && !effectiveMapping.color) effectiveMapping.color = '__default_color'
  if (defaults.canRotate !== undefined && !effectiveMapping.canRotate) effectiveMapping.canRotate = '__default_canRotate'
  if (defaults.stackable !== undefined && !effectiveMapping.stackable) effectiveMapping.stackable = '__default_stackable'
  if (defaults.maxStackLayers !== undefined && !effectiveMapping.maxStackLayers) effectiveMapping.maxStackLayers = '__default_maxStackLayers'

  if (template.dimensionMode === 'combined') {
    const combinedColumn = template.combinedColumn ?? template.mapping.dimensions
    const order = template.dimensionOrder ?? dimensionFields
    if (combinedColumn) {
      const multiplier = dimensionUnitMultiplier(template, combinedColumn)
      effectiveMapping.length = '__combined_length'
      effectiveMapping.width = '__combined_width'
      effectiveMapping.height = '__combined_height'
      effectiveRows.forEach((row) => {
        const dimensions = splitCombinedDimensions(row[combinedColumn])
        if (!dimensions) return
        order.forEach((field, index) => {
          row[`__combined_${field}`] = dimensions[index] * multiplier
        })
      })
    }
  }

  dimensionFields.forEach((field) => {
    const colName = template.mapping[field]
    const unit = template.units?.[field] ?? 'auto'
    if (!colName || unit === 'auto') return
    const sanitized = colName.replace(/cm/gi, '').replace(/厘米/g, '')
    const suffix = unit === 'cm' ? ' cm' : ' mm'
    const syntheticKey = `${sanitized}__unit${suffix}`
    effectiveMapping[field] = syntheticKey
    effectiveRows.forEach((row, index) => {
      row[syntheticKey] = objectRows[startIndex + index]?.[colName]
    })
  })

  return parseCargoRowsWithMapping(effectiveRows, effectiveMapping, options)
}
