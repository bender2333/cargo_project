import type { ExportTemplate, ExportTemplateColumn } from '../types'
import { EXPORT_FIELD_KEYS, isExportDimensionField } from '../lib/exportPlan'
import { fetchWithAuth } from './client'

const allowedFields = new Set<string>(EXPORT_FIELD_KEYS)

type ExportTemplateDto = {
  id: string
  name: string
  columns?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

export type ExportTemplatePayload = {
  name: string
  columns: ExportTemplateColumn[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeColumns(value: unknown): ExportTemplateColumn[] {
  if (!Array.isArray(value)) return []

  const columns: ExportTemplateColumn[] = []
  const seenFields = new Set<string>()
  for (const item of value) {
    if (!isRecord(item) || typeof item.field !== 'string') continue
    const field = item.field
    if (!allowedFields.has(field) || seenFields.has(field)) continue
    seenFields.add(field)

    const column: ExportTemplateColumn = {
      field,
      header: typeof item.header === 'string' ? item.header : field,
    }
    if (isExportDimensionField(field) && (item.unit === 'mm' || item.unit === 'cm')) {
      column.unit = item.unit
    }
    columns.push(column)
  }
  return columns
}

function templateFromDto(item: ExportTemplateDto): ExportTemplate {
  const template: ExportTemplate = {
    id: item.id,
    name: item.name,
    columns: normalizeColumns(item.columns),
  }
  if (typeof item.createdAt === 'string') template.createdAt = item.createdAt
  if (typeof item.updatedAt === 'string') template.updatedAt = item.updatedAt
  return template
}

function payloadForRequest(payload: ExportTemplatePayload): ExportTemplatePayload {
  return {
    name: payload.name,
    columns: normalizeColumns(payload.columns),
  }
}

async function writeExportTemplate(
  path: string,
  method: 'POST' | 'PUT',
  payload: ExportTemplatePayload,
): Promise<ExportTemplate> {
  const response = await fetchWithAuth(path, {
    method,
    body: JSON.stringify(payloadForRequest(payload)),
  })
  if (!response.ok) throw new Error('保存导出模板失败')
  return templateFromDto(await response.json() as ExportTemplateDto)
}

export async function readExportTemplates(): Promise<ExportTemplate[]> {
  const response = await fetchWithAuth('/api/export-templates')
  if (!response.ok) throw new Error('导出模板加载失败')
  const data = await response.json() as ExportTemplateDto[]
  return data.map(templateFromDto)
}

export function saveExportTemplate(payload: ExportTemplatePayload): Promise<ExportTemplate> {
  return writeExportTemplate('/api/export-templates', 'POST', payload)
}

export function updateExportTemplate(id: string, payload: ExportTemplatePayload): Promise<ExportTemplate> {
  return writeExportTemplate(`/api/export-templates/${id}`, 'PUT', payload)
}

export async function deleteExportTemplate(id: string): Promise<void> {
  const response = await fetchWithAuth(`/api/export-templates/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error('删除导出模板失败')
}
