import type { ExportTemplate, ExportTemplateColumn } from '../types'
import { fetchWithAuth } from '../api/client'

export type ExportTemplatePayload = {
  name: string
  columns: ExportTemplateColumn[]
}

export async function readExportTemplates(): Promise<ExportTemplate[]> {
  const res = await fetchWithAuth('/api/export-templates')
  if (!res.ok) return []
  return res.json()
}

export async function saveExportTemplate(payload: ExportTemplatePayload): Promise<ExportTemplate | null> {
  const res = await fetchWithAuth('/api/export-templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  return res.json()
}

export async function updateExportTemplate(id: string, payload: ExportTemplatePayload): Promise<ExportTemplate | null> {
  const res = await fetchWithAuth(`/api/export-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  return res.json()
}

export async function deleteExportTemplate(id: string): Promise<boolean> {
  const res = await fetchWithAuth(`/api/export-templates/${id}`, {
    method: 'DELETE',
  })
  return res.ok
}
