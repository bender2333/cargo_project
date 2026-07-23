import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { ExportColumnsEditor } from './ExportColumnsEditor'
import type { ExportColumnsEditorLabels } from './ExportColumnsEditor'
import { ImportMappingForm } from './ImportMappingForm'
import type { ImportMappingFormLabels, ImportMappingValue } from './ImportMappingForm'
import type { ExportTemplatePayload, ImportTemplatePayload } from '../hooks/useTemplateCatalogs'
import type { ImportCargoRow } from '../lib/importCargo'
import { importColumnsForHeaderRow } from '../lib/importTable'
import { EXPORT_FIELD_KEYS } from '../lib/exportPlan'
import type { ExportTemplate, ImportTemplate, Locale } from '../types'

export type TemplateManagerLabels = ImportMappingFormLabels & ExportColumnsEditorLabels & {
  templateManager: string
  backToWorkbench: string
  templateLoadSample: string
  templateNew: string
  templateSampleLoaded: string
  templateName: string
  templateCreate: string
  templateUpdate: string
  templateEdit: string
  templateDelete: string
  templateSaved: string
  templateUpdated: string
  templateDeleted: string
  templateEmpty: string
  importTemplateRetry: string
  importTemplateLoadFailed: string
  exportTemplateManager: string
  exportTemplateEmpty: string
  exportTemplateRetry: string
  exportTemplateLoadFailed: string
  cancel: string
}

type Props = {
  locale: Locale
  labels: TemplateManagerLabels
  importTemplates: ImportTemplate[]
  importLoadFailed: boolean
  exportTemplates: ExportTemplate[]
  exportLoadFailed: boolean
  onRetryImport: () => Promise<void>
  onCreateImport: (payload: ImportTemplatePayload) => Promise<ImportTemplate | null>
  onUpdateImport: (id: string, payload: ImportTemplatePayload) => Promise<ImportTemplate | null>
  onDeleteImport: (id: string) => Promise<boolean>
  onRetryExport: () => Promise<void>
  onCreateExport: (payload: ExportTemplatePayload) => Promise<ExportTemplate | null>
  onUpdateExport: (id: string, payload: ExportTemplatePayload) => Promise<ExportTemplate | null>
  onDeleteExport: (id: string) => Promise<boolean>
  onBack: () => void
}

type ImportEditState = {
  id: string
  draft: ImportTemplatePayload
}

type ExportEditState = {
  id: string
  draft: ExportTemplatePayload
}

type WorksheetCell = string | number | boolean | null | undefined

function createBlankImportTemplate(): ImportTemplatePayload {
  return {
    name: '',
    mapping: {
      label: '',
      name: '',
      length: '',
      width: '',
      height: '',
      weight: '',
      quantity: '',
    },
    units: {
      length: 'auto',
      width: 'auto',
      height: 'auto',
    },
    headerRow: 1,
    startRow: 2,
    mergeRows: 'none',
    dimensionMode: 'separate',
    combinedColumn: '',
    dimensionOrder: ['length', 'width', 'height'],
    defaultValues: { quantity: 1, canRotate: true, stackable: true },
  }
}

function createImportEditState(template: ImportTemplate): ImportEditState {
  return {
    id: template.id,
    draft: {
      name: template.name,
      mapping: { ...template.mapping },
      units: { ...template.units },
      headerRow: template.headerRow,
      startRow: template.startRow,
      mergeRows: template.mergeRows,
      dimensionMode: template.dimensionMode ?? 'separate',
      combinedColumn: template.combinedColumn || template.mapping.dimensions || '',
      dimensionOrder: [...(template.dimensionOrder ?? ['length', 'width', 'height'])],
      defaultValues: { ...template.defaultValues },
    },
  }
}

function draftToMappingValue(draft: ImportTemplatePayload): ImportMappingValue {
  return {
    mapping: draft.mapping,
    units: draft.units,
    headerRow: draft.headerRow ?? 1,
    startRow: draft.startRow ?? 2,
    dimensionMode: draft.dimensionMode ?? 'separate',
    combinedColumn: draft.combinedColumn || draft.mapping.dimensions || '',
    dimensionOrder: draft.dimensionOrder ?? ['length', 'width', 'height'],
    defaults: draft.defaultValues ?? {},
  }
}

function applyMappingValueToDraft(draft: ImportTemplatePayload, next: ImportMappingValue): ImportTemplatePayload {
  return {
    ...draft,
    mapping: next.mapping,
    units: next.units,
    headerRow: next.headerRow,
    startRow: next.startRow,
    dimensionMode: next.dimensionMode,
    combinedColumn: next.combinedColumn,
    dimensionOrder: next.dimensionOrder,
    defaultValues: next.defaults,
  }
}

function importPayloadFromDraft(draft: ImportTemplatePayload, name: string): ImportTemplatePayload {
  return {
    name,
    mapping: draft.mapping,
    units: draft.units,
    headerRow: draft.headerRow,
    startRow: draft.startRow,
    mergeRows: draft.mergeRows,
    dimensionMode: draft.dimensionMode,
    combinedColumn: draft.combinedColumn || draft.mapping.dimensions || '',
    dimensionOrder: draft.dimensionOrder,
    defaultValues: draft.defaultValues,
  }
}

function createBlankExportTemplate(): ExportTemplatePayload {
  return {
    name: '',
    columns: EXPORT_FIELD_KEYS.map((field) => ({ field, header: field })),
  }
}

export function TemplateManagerPage({
  locale,
  labels,
  importTemplates,
  importLoadFailed,
  exportTemplates,
  exportLoadFailed,
  onRetryImport,
  onCreateImport,
  onUpdateImport,
  onDeleteImport,
  onRetryExport,
  onCreateExport,
  onUpdateExport,
  onDeleteExport,
  onBack,
}: Props) {
  const [notice, setNotice] = useState('')
  const [sampleRows, setSampleRows] = useState<ImportCargoRow[]>([])
  const [newImportDraft, setNewImportDraft] = useState<ImportTemplatePayload | null>(null)
  const [editingImport, setEditingImport] = useState<ImportEditState | null>(null)
  const [newExportDraft, setNewExportDraft] = useState<ExportTemplatePayload | null>(null)
  const [editingExport, setEditingExport] = useState<ExportEditState | null>(null)
  const [pendingActions, setPendingActions] = useState<ReadonlySet<string>>(() => new Set())
  const mountedRef = useRef(true)
  const sampleRequestIdRef = useRef(0)
  const pendingActionsRef = useRef(new Set<string>())
  const operationEpochRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      sampleRequestIdRef.current += 1
      operationEpochRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (importLoadFailed) return
    setEditingImport((current) => current && !importTemplates.some((template) => template.id === current.id) ? null : current)
  }, [importLoadFailed, importTemplates])

  useEffect(() => {
    if (exportLoadFailed) return
    setEditingExport((current) => current && !exportTemplates.some((template) => template.id === current.id) ? null : current)
  }, [exportLoadFailed, exportTemplates])

  const loadSampleHeaders = async (file: File | null) => {
    if (!file) return
    const requestId = ++sampleRequestIdRef.current
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!mountedRef.current || requestId !== sampleRequestIdRef.current) return
      setSampleRows(sheet ? XLSX.utils.sheet_to_json<WorksheetCell[]>(sheet, { header: 1, raw: true }) : [])
    } catch (error) {
      if (!mountedRef.current || requestId !== sampleRequestIdRef.current) return
      console.error('[template-sample]', error)
      setSampleRows([])
    }
  }

  const beginOperation = (key: string): number | null => {
    if (pendingActionsRef.current.has(key)) return null
    const next = new Set(pendingActionsRef.current)
    next.add(key)
    pendingActionsRef.current = next
    setPendingActions(next)
    setNotice('')
    operationEpochRef.current += 1
    return operationEpochRef.current
  }

  const finishOperation = (key: string) => {
    const next = new Set(pendingActionsRef.current)
    next.delete(key)
    pendingActionsRef.current = next
    if (mountedRef.current) setPendingActions(next)
  }

  const canPublishOperation = (operationId: number) => (
    mountedRef.current && operationEpochRef.current === operationId
  )

  const saveNewImport = async () => {
    const draft = newImportDraft
    const name = draft?.name.trim()
    if (!draft || !name) return
    const actionKey = 'import:create'
    const operationId = beginOperation(actionKey)
    if (operationId === null) return
    try {
      const saved = await onCreateImport(importPayloadFromDraft(draft, name))
      if (!saved || !mountedRef.current) return
      setNewImportDraft((current) => current === draft ? null : current)
      if (canPublishOperation(operationId)) setNotice(`${labels.templateSaved}: ${saved.name}`)
    } catch (error) {
      if (!mountedRef.current) return
      console.error(error)
      window.alert(locale === 'zh' ? '创建模板失败' : 'Failed to create template')
    } finally {
      finishOperation(actionKey)
    }
  }

  const saveEditedImport = async () => {
    const editState = editingImport
    const name = editState?.draft.name.trim()
    if (!editState || !name) return
    const actionKey = `import:${editState.id}`
    const operationId = beginOperation(actionKey)
    if (operationId === null) return
    try {
      const updated = await onUpdateImport(editState.id, importPayloadFromDraft(editState.draft, name))
      if (!updated || !mountedRef.current) return
      setEditingImport((current) => current === editState ? null : current)
      if (canPublishOperation(operationId)) setNotice(`${labels.templateUpdated}: ${updated.name}`)
    } catch (error) {
      if (!mountedRef.current) return
      console.error(error)
      window.alert(locale === 'zh' ? '更新模板失败' : 'Failed to update template')
    } finally {
      finishOperation(actionKey)
    }
  }

  const removeImport = async (id: string) => {
    const actionKey = `import:${id}`
    const operationId = beginOperation(actionKey)
    if (operationId === null) return
    try {
      const removed = await onDeleteImport(id)
      if (!removed || !mountedRef.current) return
      setEditingImport((current) => current?.id === id ? null : current)
      if (canPublishOperation(operationId)) setNotice(labels.templateDeleted)
    } catch (error) {
      if (!mountedRef.current) return
      console.error(error)
      window.alert(locale === 'zh' ? '删除模板失败' : 'Failed to delete template')
    } finally {
      finishOperation(actionKey)
    }
  }

  const saveNewExport = async () => {
    const draft = newExportDraft
    const name = draft?.name.trim()
    if (!draft || !name) return
    const actionKey = 'export:create'
    const operationId = beginOperation(actionKey)
    if (operationId === null) return
    try {
      const saved = await onCreateExport({ name, columns: draft.columns })
      if (!saved || !mountedRef.current) return
      setNewExportDraft((current) => current === draft ? null : current)
      if (canPublishOperation(operationId)) setNotice(`${labels.templateSaved}: ${saved.name}`)
    } catch (error) {
      if (!mountedRef.current) return
      console.error(error)
      window.alert(locale === 'zh' ? '创建导出模板失败' : 'Failed to create export template')
    } finally {
      finishOperation(actionKey)
    }
  }

  const saveEditedExport = async () => {
    const editState = editingExport
    const name = editState?.draft.name.trim()
    if (!editState || !name) return
    const actionKey = `export:${editState.id}`
    const operationId = beginOperation(actionKey)
    if (operationId === null) return
    try {
      const updated = await onUpdateExport(editState.id, { name, columns: editState.draft.columns })
      if (!updated || !mountedRef.current) return
      setEditingExport((current) => current === editState ? null : current)
      if (canPublishOperation(operationId)) setNotice(`${labels.templateUpdated}: ${updated.name}`)
    } catch (error) {
      if (!mountedRef.current) return
      console.error(error)
      window.alert(locale === 'zh' ? '更新导出模板失败' : 'Failed to update export template')
    } finally {
      finishOperation(actionKey)
    }
  }

  const removeExport = async (id: string) => {
    const actionKey = `export:${id}`
    const operationId = beginOperation(actionKey)
    if (operationId === null) return
    try {
      const removed = await onDeleteExport(id)
      if (!removed || !mountedRef.current) return
      setEditingExport((current) => current?.id === id ? null : current)
      if (canPublishOperation(operationId)) setNotice(labels.templateDeleted)
    } catch (error) {
      if (!mountedRef.current) return
      console.error(error)
      window.alert(locale === 'zh' ? '删除导出模板失败' : 'Failed to delete export template')
    } finally {
      finishOperation(actionKey)
    }
  }

  return (
    <section className="archive-card overflow-hidden p-[18px]" data-testid="template-manager-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{labels.templateManager}</h2>
        <button className="archive-button secondary" type="button" onClick={onBack}>{labels.backToWorkbench}</button>
      </div>

      <div className="rounded-lg border border-[#c6c6c6] bg-white p-4" data-testid="template-manager-list">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{labels.templateManager}</h3>
          <div className="flex flex-wrap items-center gap-2">
            {notice && <span className="text-xs font-semibold text-[#047857]">{notice}</span>}
            <label className="archive-button secondary cursor-pointer px-3 py-1.5 text-xs">
              {labels.templateLoadSample}
              <input
                className="hidden"
                type="file"
                accept=".xlsx,.xls,.csv"
                data-testid="template-manager-sample-input"
                onChange={(event) => {
                  void loadSampleHeaders(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
              />
            </label>
            <button
              className="archive-button success px-3 py-1.5 text-xs"
              data-testid="template-manager-new"
              type="button"
              disabled={pendingActions.has('import:create')}
              onClick={() => setNewImportDraft(createBlankImportTemplate())}
            >
              {labels.templateNew}
            </button>
          </div>
        </div>
        {sampleRows.length > 0 && (
          <p className="mb-3 text-xs font-semibold text-[#047857]" data-testid="template-manager-sample-status">
            {labels.templateSampleLoaded}: {importColumnsForHeaderRow(sampleRows, 1).length}
          </p>
        )}
        {newImportDraft && (
          <div className="mb-4 grid gap-2 rounded border border-[#93c5fd] bg-[#eff6ff] p-3 text-sm" data-testid="template-manager-new-form">
            <label className="text-xs font-semibold text-[#475569]">
              {labels.templateName}
              <input
                className="field-input mt-1"
                data-testid="template-manager-new-name"
                value={newImportDraft.name}
                onChange={(event) => setNewImportDraft((current) => current ? { ...current, name: event.target.value } : current)}
              />
            </label>
            <ImportMappingForm
              value={draftToMappingValue(newImportDraft)}
              onChange={(next) => setNewImportDraft((current) => current ? applyMappingValueToDraft(current, next) : current)}
              availableColumns={importColumnsForHeaderRow(sampleRows, newImportDraft.headerRow ?? 1)}
              labels={labels}
              testIdPrefix="tm-new-"
            />
            <div className="flex flex-wrap gap-2">
              <button className="archive-button success px-2 py-1 text-xs" data-testid="template-manager-new-save" type="button" onClick={() => void saveNewImport()} disabled={!newImportDraft.name.trim() || pendingActions.has('import:create')}>{labels.templateCreate}</button>
              <button className="archive-button secondary px-2 py-1 text-xs" type="button" onClick={() => setNewImportDraft(null)}>{labels.cancel}</button>
            </div>
          </div>
        )}
        {importLoadFailed ? (
          <div className="flex items-center justify-between gap-3 border border-red-300 bg-red-50 p-3 text-sm text-red-700" data-testid="import-template-load-error">
            <span>{labels.importTemplateLoadFailed}</span>
            <button className="archive-button secondary" type="button" onClick={() => void onRetryImport()}>{labels.importTemplateRetry}</button>
          </div>
        ) : importTemplates.length === 0 ? (
          <p className="text-sm text-[#64748b]" data-testid="template-manager-empty-state">{labels.templateEmpty}</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {importTemplates.map((template) => (
              <article className="rounded border border-[#d1d5db] bg-[#f8fafc] p-3 text-sm" data-testid={`template-manager-row-${template.id}`} key={template.id}>
                {editingImport?.id === template.id ? (
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold text-[#475569]">
                      {labels.templateName}
                      <input
                        className="field-input mt-1"
                        data-testid={`template-manager-name-${template.id}`}
                        value={editingImport.draft.name}
                        onChange={(event) => setEditingImport((current) => current?.id === template.id ? { ...current, draft: { ...current.draft, name: event.target.value } } : current)}
                      />
                    </label>
                    <ImportMappingForm
                      value={draftToMappingValue(editingImport.draft)}
                      onChange={(next) => setEditingImport((current) => current?.id === template.id ? { ...current, draft: applyMappingValueToDraft(current.draft, next) } : current)}
                      availableColumns={importColumnsForHeaderRow(sampleRows, editingImport.draft.headerRow ?? 1)}
                      labels={labels}
                      testIdPrefix={`tm-edit-${template.id}-`}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button className="archive-button success px-2 py-1 text-xs" data-testid={`template-manager-save-${template.id}`} type="button" onClick={() => void saveEditedImport()} disabled={pendingActions.has(`import:${template.id}`)}>{labels.templateUpdate}</button>
                      <button className="archive-button secondary px-2 py-1 text-xs" type="button" onClick={() => setEditingImport(null)}>{labels.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <strong>{template.name}</strong>
                    <p className="mt-1 text-xs text-[#64748b]">
                      {labels.templateHeaderRow}: {template.headerRow ?? 1} · {labels.templateStartRow}: {template.startRow ?? 2} · {labels.templateDimensionMode}: {template.dimensionMode ?? 'separate'}
                    </p>
                    <p className="mt-1 truncate text-xs text-[#64748b]">
                      {Object.entries(template.mapping).filter(([, value]) => value).map(([key, value]) => `${key}:${value}`).join(', ') || '-'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="archive-button secondary px-2 py-1 text-xs" data-testid={`template-manager-edit-${template.id}`} type="button" disabled={pendingActions.has(`import:${template.id}`)} onClick={() => setEditingImport(createImportEditState(template))}>{labels.templateEdit}</button>
                      <button className="archive-button px-2 py-1 text-xs text-red-700" data-testid={`template-manager-delete-${template.id}`} type="button" disabled={pendingActions.has(`import:${template.id}`)} onClick={() => void removeImport(template.id)}>{labels.templateDelete}</button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-[#c6c6c6] bg-white p-4" data-testid="export-template-list">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold">{labels.exportTemplateManager}</h3>
          <button
            className="archive-button success px-3 py-1.5 text-xs"
            data-testid="export-template-new"
            type="button"
            disabled={pendingActions.has('export:create')}
            onClick={() => setNewExportDraft(createBlankExportTemplate())}
          >
            {labels.templateNew}
          </button>
        </div>
        {newExportDraft && (
          <div className="mb-4 grid gap-2 rounded border border-[#93c5fd] bg-[#eff6ff] p-3 text-sm" data-testid="export-template-new-form">
            <label className="text-xs font-semibold text-[#475569]">
              {labels.templateName}
              <input
                className="field-input mt-1"
                data-testid="export-template-new-name"
                value={newExportDraft.name}
                onChange={(event) => setNewExportDraft((current) => current ? { ...current, name: event.target.value } : current)}
              />
            </label>
            <ExportColumnsEditor
              columns={newExportDraft.columns}
              onChange={(columns) => setNewExportDraft((current) => current ? { ...current, columns } : current)}
              labels={labels}
              testIdPrefix="ex-new-"
            />
            <div className="flex flex-wrap gap-2">
              <button className="archive-button success px-2 py-1 text-xs" data-testid="export-template-new-save" type="button" onClick={() => void saveNewExport()} disabled={!newExportDraft.name.trim() || pendingActions.has('export:create')}>{labels.templateCreate}</button>
              <button className="archive-button secondary px-2 py-1 text-xs" type="button" onClick={() => setNewExportDraft(null)}>{labels.cancel}</button>
            </div>
          </div>
        )}
        {exportLoadFailed ? (
          <div className="flex items-center justify-between gap-3 border border-red-300 bg-red-50 p-3 text-sm text-red-700" data-testid="export-template-load-error">
            <span>{labels.exportTemplateLoadFailed}</span>
            <button className="archive-button secondary" type="button" onClick={() => void onRetryExport()}>{labels.exportTemplateRetry}</button>
          </div>
        ) : exportTemplates.length === 0 ? (
          <p className="text-sm text-[#64748b]" data-testid="export-template-empty-state">{labels.exportTemplateEmpty}</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {exportTemplates.map((template) => (
              <article className="rounded border border-[#d1d5db] bg-[#f8fafc] p-3 text-sm" data-testid={`export-template-row-${template.id}`} key={template.id}>
                {editingExport?.id === template.id ? (
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold text-[#475569]">
                      {labels.templateName}
                      <input
                        className="field-input mt-1"
                        data-testid={`export-template-name-${template.id}`}
                        value={editingExport.draft.name}
                        onChange={(event) => setEditingExport((current) => current?.id === template.id ? { ...current, draft: { ...current.draft, name: event.target.value } } : current)}
                      />
                    </label>
                    <ExportColumnsEditor
                      columns={editingExport.draft.columns}
                      onChange={(columns) => setEditingExport((current) => current?.id === template.id ? { ...current, draft: { ...current.draft, columns } } : current)}
                      labels={labels}
                      testIdPrefix={`ex-edit-${template.id}-`}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button className="archive-button success px-2 py-1 text-xs" data-testid={`export-template-save-${template.id}`} type="button" onClick={() => void saveEditedExport()} disabled={pendingActions.has(`export:${template.id}`)}>{labels.templateUpdate}</button>
                      <button className="archive-button secondary px-2 py-1 text-xs" type="button" onClick={() => setEditingExport(null)}>{labels.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <strong>{template.name}</strong>
                    <p className="mt-1 truncate text-xs text-[#64748b]">
                      {template.columns.map((column) => column.header || column.field).join(', ') || '-'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="archive-button secondary px-2 py-1 text-xs" data-testid={`export-template-edit-${template.id}`} type="button" disabled={pendingActions.has(`export:${template.id}`)} onClick={() => setEditingExport({ id: template.id, draft: { name: template.name, columns: template.columns.map((column) => ({ ...column })) } })}>{labels.templateEdit}</button>
                      <button className="archive-button px-2 py-1 text-xs text-red-700" data-testid={`export-template-delete-${template.id}`} type="button" disabled={pendingActions.has(`export:${template.id}`)} onClick={() => void removeExport(template.id)}>{labels.templateDelete}</button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
