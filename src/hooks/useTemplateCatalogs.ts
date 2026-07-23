import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteExportTemplate as deleteExportTemplateRequest,
  readExportTemplates,
  saveExportTemplate as saveExportTemplateRequest,
  updateExportTemplate as updateExportTemplateRequest,
} from '../api/exportTemplates'
import type { ExportTemplatePayload } from '../api/exportTemplates'
import {
  deleteImportTemplate as deleteImportTemplateRequest,
  readImportTemplates,
  saveImportTemplate as saveImportTemplateRequest,
  updateImportTemplate as updateImportTemplateRequest,
} from '../api/importTemplates'
import type { ImportTemplatePayload } from '../api/importTemplates'
import type { ExportTemplate, ImportTemplate } from '../types'

export type { ExportTemplatePayload, ImportTemplatePayload }

export function shouldClearTemplateReference(
  referenceId: string,
  templates: ReadonlyArray<{ id: string }>,
  loadFailed: boolean,
): boolean {
  return !loadFailed && referenceId !== '' && !templates.some((template) => template.id === referenceId)
}

export function reconcileSelectedTemplateName(
  currentName: string,
  previousTemplate: { id: string; name: string } | null,
  selectedTemplate: { id: string; name: string },
): string {
  if (!previousTemplate || previousTemplate.id !== selectedTemplate.id || currentName === previousTemplate.name) {
    return selectedTemplate.name
  }
  return currentName
}

export type TemplateCatalogsController = {
  importTemplates: ImportTemplate[]
  importLoadFailed: boolean
  refreshImportTemplates: () => Promise<void>
  createImportTemplate: (payload: ImportTemplatePayload) => Promise<ImportTemplate | null>
  updateImportTemplate: (id: string, payload: ImportTemplatePayload) => Promise<ImportTemplate | null>
  removeImportTemplate: (id: string) => Promise<boolean>
  exportTemplates: ExportTemplate[]
  exportLoadFailed: boolean
  refreshExportTemplates: () => Promise<void>
  createExportTemplate: (payload: ExportTemplatePayload) => Promise<ExportTemplate | null>
  updateExportTemplate: (id: string, payload: ExportTemplatePayload) => Promise<ExportTemplate | null>
  removeExportTemplate: (id: string) => Promise<boolean>
}

export function useTemplateCatalogs(): TemplateCatalogsController {
  const [importTemplates, setImportTemplates] = useState<ImportTemplate[]>([])
  const [importLoadFailed, setImportLoadFailed] = useState(false)
  const [exportTemplates, setExportTemplates] = useState<ExportTemplate[]>([])
  const [exportLoadFailed, setExportLoadFailed] = useState(false)
  const importRequestIdRef = useRef(0)
  const exportRequestIdRef = useRef(0)
  const mountedRef = useRef(false)
  const lifecycleEpochRef = useRef(0)

  const refreshImportTemplates = useCallback(async () => {
    if (!mountedRef.current) return
    const requestId = ++importRequestIdRef.current
    try {
      const templates = await readImportTemplates()
      if (requestId !== importRequestIdRef.current) return
      setImportTemplates(templates)
      setImportLoadFailed(false)
    } catch (error) {
      if (requestId !== importRequestIdRef.current) return
      console.error(error)
      setImportLoadFailed(true)
    }
  }, [])

  const refreshExportTemplates = useCallback(async () => {
    if (!mountedRef.current) return
    const requestId = ++exportRequestIdRef.current
    try {
      const templates = await readExportTemplates()
      if (requestId !== exportRequestIdRef.current) return
      setExportTemplates(templates)
      setExportLoadFailed(false)
    } catch (error) {
      if (requestId !== exportRequestIdRef.current) return
      console.error(error)
      setExportLoadFailed(true)
    }
  }, [])

  const createImportTemplate = useCallback(async (payload: ImportTemplatePayload) => {
    const lifecycleEpoch = lifecycleEpochRef.current
    let saved: ImportTemplate
    try {
      saved = await saveImportTemplateRequest(payload)
    } catch (error) {
      if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return null
      throw error
    }
    if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return null
    importRequestIdRef.current += 1
    setImportTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
    void refreshImportTemplates()
    return saved
  }, [refreshImportTemplates])

  const updateImportTemplate = useCallback(async (id: string, payload: ImportTemplatePayload) => {
    const lifecycleEpoch = lifecycleEpochRef.current
    let updated: ImportTemplate
    try {
      updated = await updateImportTemplateRequest(id, payload)
    } catch (error) {
      if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return null
      throw error
    }
    if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return null
    importRequestIdRef.current += 1
    setImportTemplates((current) => current.map((item) => item.id === updated.id ? updated : item))
    void refreshImportTemplates()
    return updated
  }, [refreshImportTemplates])

  const removeImportTemplate = useCallback(async (id: string) => {
    const lifecycleEpoch = lifecycleEpochRef.current
    try {
      await deleteImportTemplateRequest(id)
    } catch (error) {
      if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return false
      throw error
    }
    if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return false
    importRequestIdRef.current += 1
    setImportTemplates((current) => current.filter((item) => item.id !== id))
    void refreshImportTemplates()
    return true
  }, [refreshImportTemplates])

  const createExportTemplate = useCallback(async (payload: ExportTemplatePayload) => {
    const lifecycleEpoch = lifecycleEpochRef.current
    let saved: ExportTemplate
    try {
      saved = await saveExportTemplateRequest(payload)
    } catch (error) {
      if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return null
      throw error
    }
    if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return null
    exportRequestIdRef.current += 1
    setExportTemplates((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
    void refreshExportTemplates()
    return saved
  }, [refreshExportTemplates])

  const updateExportTemplate = useCallback(async (id: string, payload: ExportTemplatePayload) => {
    const lifecycleEpoch = lifecycleEpochRef.current
    let updated: ExportTemplate
    try {
      updated = await updateExportTemplateRequest(id, payload)
    } catch (error) {
      if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return null
      throw error
    }
    if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return null
    exportRequestIdRef.current += 1
    setExportTemplates((current) => current.map((item) => item.id === updated.id ? updated : item))
    void refreshExportTemplates()
    return updated
  }, [refreshExportTemplates])

  const removeExportTemplate = useCallback(async (id: string) => {
    const lifecycleEpoch = lifecycleEpochRef.current
    try {
      await deleteExportTemplateRequest(id)
    } catch (error) {
      if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return false
      throw error
    }
    if (!mountedRef.current || lifecycleEpoch !== lifecycleEpochRef.current) return false
    exportRequestIdRef.current += 1
    setExportTemplates((current) => current.filter((item) => item.id !== id))
    void refreshExportTemplates()
    return true
  }, [refreshExportTemplates])

  useEffect(() => {
    mountedRef.current = true
    lifecycleEpochRef.current += 1
    const requestTimer = window.setTimeout(() => {
      void refreshImportTemplates()
      void refreshExportTemplates()
    }, 0)

    return () => {
      window.clearTimeout(requestTimer)
      mountedRef.current = false
      lifecycleEpochRef.current += 1
      importRequestIdRef.current += 1
      exportRequestIdRef.current += 1
    }
  }, [refreshExportTemplates, refreshImportTemplates])

  return {
    importTemplates,
    importLoadFailed,
    refreshImportTemplates,
    createImportTemplate,
    updateImportTemplate,
    removeImportTemplate,
    exportTemplates,
    exportLoadFailed,
    refreshExportTemplates,
    createExportTemplate,
    updateExportTemplate,
    removeExportTemplate,
  }
}
