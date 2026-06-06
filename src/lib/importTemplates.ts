import type { ImportTemplate, ImportTemplateDefaults, ImportTemplateUnits } from '../types'
import { fetchWithAuth } from './auth'

export type ImportTemplatePayload = {
  name: string
  mapping: Record<string, string>
  units: ImportTemplateUnits
  headerRow?: number
  startRow?: number
  mergeRows?: ImportTemplate['mergeRows']
  defaultValues?: ImportTemplateDefaults
}

export async function readImportTemplates(): Promise<ImportTemplate[]> {
  const res = await fetchWithAuth('/api/import-templates')
  if (!res.ok) return []
  return res.json()
}

export async function saveImportTemplate(payload: ImportTemplatePayload): Promise<ImportTemplate | null> {
  const res = await fetchWithAuth('/api/import-templates', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  return res.json()
}

export async function updateImportTemplate(id: string, payload: ImportTemplatePayload): Promise<ImportTemplate | null> {
  const res = await fetchWithAuth(`/api/import-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  return res.json()
}

export async function deleteImportTemplate(id: string): Promise<boolean> {
  const res = await fetchWithAuth(`/api/import-templates/${id}`, {
    method: 'DELETE',
  })
  return res.ok
}
