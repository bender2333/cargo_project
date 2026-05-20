import type { CargoItem } from '../types'

type RowValue = string | number | boolean | null | undefined
export type ImportCargoRow = Record<string, RowValue>

export type ImportCargoIssue = {
  row: number
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
  }
}

type ParseOptions = {
  createId?: () => string
  colors?: string[]
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
}

function valueFor(row: ImportCargoRow, candidates: string[]) {
  for (const key of candidates) {
    const value = row[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return undefined
}

function hasValueFor(row: ImportCargoRow, candidates: string[]) {
  return valueFor(row, candidates) !== undefined
}

function numberValue(value: RowValue) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function positiveNumber(row: ImportCargoRow, mmKeys: string[], cmKeys: string[]) {
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
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return alphabet[index % alphabet.length]
}

export function parseCargoRows(rows: ImportCargoRow[], options: ParseOptions = {}): ImportCargoResult {
  const colors = options.colors ?? defaultColors
  const createId = options.createId ?? (() => crypto.randomUUID())
  const errors: ImportCargoIssue[] = []
  const warnings: ImportCargoIssue[] = []
  const items: CargoItem[] = []
  const mappedFields = new Set<string>()
  let convertedCentimeterRows = 0

  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const length = positiveNumber(row, fields.lengthMm, fields.lengthCm)
    const width = positiveNumber(row, fields.widthMm, fields.widthCm)
    const height = positiveNumber(row, fields.heightMm, fields.heightCm)
    const convertedFromCm = length.convertedFromCm || width.convertedFromCm || height.convertedFromCm

    if (length.value <= 0 || width.value <= 0 || height.value <= 0) {
      errors.push({ row: rowNumber, message: 'Missing or invalid length, width, or height.' })
      return
    }

    const quantity = Math.floor(numberValue(valueFor(row, fields.quantity)))
    if (quantity <= 0) {
      errors.push({ row: rowNumber, message: 'Missing or invalid quantity.' })
      return
    }

    if (convertedFromCm) {
      warnings.push({ row: rowNumber, message: 'Centimeter dimensions were converted to millimeters.' })
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
    ]

    fieldMappings.forEach(({ field, candidates }) => {
      if (hasValueFor(row, candidates)) {
        mappedFields.add(field)
      }
    })

    const label = String(valueFor(row, fields.label) ?? fallbackLabel(index)).toUpperCase().slice(0, 2)
    const name = String(valueFor(row, fields.name) ?? `Cargo ${index + 1}`)
    const color = String(valueFor(row, fields.color) ?? colors[index % colors.length])

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
    },
  }
}
