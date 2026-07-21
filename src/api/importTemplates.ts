import type {
  ImportTemplate,
  ImportTemplateDefaults,
  ImportTemplateUnits,
} from '../types'
import { fetchWithAuth } from './client'

const mappingFields = [
  'label',
  'name',
  'length',
  'width',
  'height',
  'weight',
  'quantity',
  'color',
  'canRotate',
  'stackable',
  'maxStackLayers',
  'groundOnly',
  'dimensions',
] as const

const defaultDimensionOrder: ImportTemplate['dimensionOrder'] = ['length', 'width', 'height']

type ImportTemplateDto = {
  id: string
  name: string
  mapping?: unknown
  units?: unknown
  headerRow?: unknown
  startRow?: unknown
  mergeRows?: unknown
  dimensionMode?: unknown
  combinedColumn?: unknown
  dimensionOrder?: unknown
  defaultValues?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

export type ImportTemplatePayload = {
  name: string
  mapping: Record<string, string>
  units: ImportTemplateUnits
  headerRow?: number
  startRow?: number
  mergeRows?: ImportTemplate['mergeRows']
  dimensionMode?: ImportTemplate['dimensionMode']
  combinedColumn?: string
  dimensionOrder?: ImportTemplate['dimensionOrder']
  defaultValues?: ImportTemplateDefaults
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeMapping(value: unknown): Record<string, string> {
  const source = isRecord(value) ? value : {}
  const mapping: Record<string, string> = {}
  for (const field of mappingFields) {
    if (!(field in source)) continue
    mapping[field] = source[field] == null ? '' : String(source[field]).slice(0, 120)
  }
  return mapping
}

function normalizeUnits(value: unknown): ImportTemplateUnits {
  const source = isRecord(value) ? value : {}
  const unit = (field: keyof ImportTemplateUnits): ImportTemplateUnits[typeof field] => {
    const candidate = source[field]
    return candidate === 'mm' || candidate === 'cm' || candidate === 'auto' ? candidate : 'auto'
  }
  return {
    length: unit('length'),
    width: unit('width'),
    height: unit('height'),
  }
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.floor(numeric)))
}

function normalizeDimensionOrder(value: unknown): ImportTemplate['dimensionOrder'] {
  if (!Array.isArray(value)) return [...defaultDimensionOrder]
  const order = value.map(String)
  const allowed = new Set(defaultDimensionOrder)
  if (order.length !== 3 || new Set(order).size !== 3 || !order.every((field) => allowed.has(field as typeof defaultDimensionOrder[number]))) {
    return [...defaultDimensionOrder]
  }
  return order as ImportTemplate['dimensionOrder']
}

function normalizeDefaults(value: unknown): ImportTemplateDefaults {
  const source = isRecord(value) ? value : {}
  const defaults: ImportTemplateDefaults = {}
  if (typeof source.label === 'string') defaults.label = source.label.trim().slice(0, 12)
  if (typeof source.name === 'string') defaults.name = source.name.trim().slice(0, 120)
  if (source.quantity != null && Number.isFinite(Number(source.quantity))) {
    defaults.quantity = Math.max(1, Math.floor(Number(source.quantity)))
  }
  if (typeof source.color === 'string') defaults.color = source.color.trim().slice(0, 40)
  if (typeof source.canRotate === 'boolean') defaults.canRotate = source.canRotate
  if (typeof source.stackable === 'boolean') defaults.stackable = source.stackable
  if (source.maxStackLayers != null && Number.isFinite(Number(source.maxStackLayers))) {
    defaults.maxStackLayers = Math.max(1, Math.floor(Number(source.maxStackLayers)))
  }
  if (typeof source.groundOnly === 'boolean') defaults.groundOnly = source.groundOnly
  return defaults
}

function templateFromDto(item: ImportTemplateDto): ImportTemplate {
  const headerRow = normalizeInteger(item.headerRow, 1, 1, 50)
  const startRow = Math.max(
    headerRow + 1,
    normalizeInteger(item.startRow, 2, 1, 500),
  )
  return {
    id: item.id,
    name: item.name,
    mapping: normalizeMapping(item.mapping),
    units: normalizeUnits(item.units),
    headerRow,
    startRow,
    mergeRows: item.mergeRows === 'by-label' ? 'by-label' : 'none',
    dimensionMode: item.dimensionMode === 'combined' ? 'combined' : 'separate',
    combinedColumn: typeof item.combinedColumn === 'string' ? item.combinedColumn : '',
    dimensionOrder: normalizeDimensionOrder(item.dimensionOrder),
    defaultValues: normalizeDefaults(item.defaultValues),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
  }
}

function payloadForRequest(payload: ImportTemplatePayload): ImportTemplatePayload {
  const request: ImportTemplatePayload = {
    name: payload.name,
    mapping: normalizeMapping(payload.mapping),
    units: normalizeUnits(payload.units),
  }
  if (payload.headerRow !== undefined) request.headerRow = payload.headerRow
  if (payload.startRow !== undefined) request.startRow = payload.startRow
  if (payload.mergeRows !== undefined) request.mergeRows = payload.mergeRows
  if (payload.dimensionMode !== undefined) request.dimensionMode = payload.dimensionMode
  if (payload.combinedColumn !== undefined) request.combinedColumn = payload.combinedColumn
  if (payload.dimensionOrder !== undefined) request.dimensionOrder = normalizeDimensionOrder(payload.dimensionOrder)
  if (payload.defaultValues !== undefined) request.defaultValues = normalizeDefaults(payload.defaultValues)
  return request
}

async function writeImportTemplate(
  path: string,
  method: 'POST' | 'PUT',
  payload: ImportTemplatePayload,
): Promise<ImportTemplate> {
  const response = await fetchWithAuth(path, {
    method,
    body: JSON.stringify(payloadForRequest(payload)),
  })
  if (!response.ok) throw new Error('保存模板失败')
  return templateFromDto(await response.json() as ImportTemplateDto)
}

export async function readImportTemplates(): Promise<ImportTemplate[]> {
  const response = await fetchWithAuth('/api/import-templates')
  if (!response.ok) throw new Error('导入模板加载失败')
  const data = await response.json() as ImportTemplateDto[]
  return data.map(templateFromDto)
}

export function saveImportTemplate(payload: ImportTemplatePayload): Promise<ImportTemplate> {
  return writeImportTemplate('/api/import-templates', 'POST', payload)
}

export function updateImportTemplate(id: string, payload: ImportTemplatePayload): Promise<ImportTemplate> {
  return writeImportTemplate(`/api/import-templates/${id}`, 'PUT', payload)
}

export async function deleteImportTemplate(id: string): Promise<void> {
  const response = await fetchWithAuth(`/api/import-templates/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('删除模板失败')
}
