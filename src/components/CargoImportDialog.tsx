import { useEffect, useMemo, useRef, useState } from 'react'
import { ImportMappingForm } from './ImportMappingForm'
import type { ImportMappingValue } from './ImportMappingForm'
import { TemplateSelectionPanel, type TemplateSelectionPanelLabels } from './TemplateSelectionPanel'
import type { CargoItem, ImportTemplate, ImportTemplateDefaults, ImportTemplateUnits, Locale } from '../types'
import { ImportTemplateRequestError, type ImportTemplatePayload } from '../api/importTemplates'
import { importColumnsForHeaderRow, importPreviewRows } from '../lib/importTable'
import type { ImportCargoRow } from '../lib/importCargo'
import { parseCargoRowsWithTemplate } from '../lib/importCargo'
import { saveLastImportConfig } from '../lib/lastImportConfig'
import {
  emptyImportMappingValue,
  importMappingValueFromTemplate,
  missingMappedColumns,
  buildImportMessages,
  sameImportMappingValue,
  validateImportMappingValue,
} from '../lib/importWorkflow'
import type { BuildImportMessagesLabels } from '../lib/importWorkflow'
import { shouldClearTemplateReference } from '../hooks/useTemplateCatalogs'

export type ImportPhase = 'template-selection' | 'mapping-preview'
export type TemplateSelectionMode = 'none' | 'existing'
export type TemplateWriteAction = 'create' | 'update' | 'copy'
type PendingTemplateWrite = TemplateWriteAction | null

type Labels = BuildImportMessagesLabels & TemplateSelectionPanelLabels & {
  mappingTitle: string
  mappingSubtitle: string
  mappingTotalRows: string
  mappingTotalCols: string
  templateLabel: string
  templateNone: string
  templateName: string
  templateSave: string
  templateSaved: string
  templateUpdated: string
  templateUpdateExplicit: string
  templateSaveAs: string
  templateSaveAsName: string
  templateNameRequired: string
  templateNameUnchanged: string
  templateNameDuplicate: string
  templateConfigInvalid: string
  templateSaveFailed: string
  mappingRequiredField: string
  templateSelectionBack: string
  mappingPreview: string
  mappingConvertHint: string
  mappingCancel: string
  mappingConfirm: string
  mappingMissingLength: string
  mappingMissingWidth: string
  mappingMissingHeight: string
  mappingMissingDimensions: string
  mappingMissingQuantity: string
  mappingRequiredHint: string
  mappingConfirmReady: string
}

type Props = {
  importRows: ImportCargoRow[]
  importTemplates: ImportTemplate[]
  importTemplateLoadFailed: boolean
  locale: Locale
  labels: Labels
  userId: string | null
  colors: readonly string[]
  onConfirm: (items: CargoItem[], messages: string[]) => void
  onClose: () => void
  onRefreshTemplates: () => void
  onCreateTemplate: (payload: ImportTemplatePayload) => Promise<ImportTemplate | null>
  onUpdateTemplate: (id: string, payload: ImportTemplatePayload) => Promise<ImportTemplate | null>
}

const BASE_IMPORT_DEFAULTS: ImportTemplateDefaults = { quantity: 1, canRotate: true, stackable: true }

function applyMappingDefaults(value: ImportMappingValue): ImportMappingValue {
  return { ...value, defaults: { ...BASE_IMPORT_DEFAULTS, ...value.defaults } }
}

export function CargoImportDialog({
  importRows,
  importTemplates,
  importTemplateLoadFailed,
  locale,
  labels,
  userId,
  colors,
  onConfirm,
  onClose,
  onRefreshTemplates,
  onCreateTemplate,
  onUpdateTemplate,
}: Props) {
  const [phase, setPhase] = useState<ImportPhase>('template-selection')
  const [selectionMode, setSelectionMode] = useState<TemplateSelectionMode | null>(null)
  const [mappingValue, setMappingValue] = useState<ImportMappingValue>(emptyImportMappingValue)
  const [selectedImportTemplateId, setSelectedImportTemplateId] = useState('')
  const [selectedTemplateName, setSelectedTemplateName] = useState('')
  const [mappingBaseline, setMappingBaseline] = useState<ImportMappingValue>(emptyImportMappingValue)
  const [templateName, setTemplateName] = useState('')
  const [templateSaveNotice, setTemplateSaveNotice] = useState('')
  const [templateWriteError, setTemplateWriteError] = useState('')
  const [pendingTemplateWrite, setPendingTemplateWrite] = useState<PendingTemplateWrite>(null)
  const pendingTemplateWriteRef = useRef<PendingTemplateWrite>(null)
  const retainSelectedIdRef = useRef<string | null>(null)
  const writeGenerationRef = useRef(0)
  const [missingImportColumns, setMissingImportColumns] = useState<string[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    writeGenerationRef.current += 1
    setPhase('template-selection')
    setSelectionMode(null)
    setMappingValue(emptyImportMappingValue())
    setMappingBaseline(emptyImportMappingValue())
    setSelectedImportTemplateId('')
    setSelectedTemplateName('')
    setTemplateName('')
    setTemplateSaveNotice('')
    setTemplateWriteError('')
    pendingTemplateWriteRef.current = null
    setPendingTemplateWrite(null)
    retainSelectedIdRef.current = null
    setMissingImportColumns([])
  }, [importRows])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    return () => previousFocus?.focus()
  }, [])

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    event.stopPropagation()
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ))
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  useEffect(() => {
    if (!selectedImportTemplateId) {
      setSelectedTemplateName('')
      return
    }
    if (importTemplateLoadFailed) return
    if (retainSelectedIdRef.current === selectedImportTemplateId) {
      if (importTemplates.some(template => template.id === selectedImportTemplateId)) {
        retainSelectedIdRef.current = null
      } else {
        return
      }
    }
    if (shouldClearTemplateReference(selectedImportTemplateId, importTemplates, importTemplateLoadFailed)) {
      setSelectedImportTemplateId('')
      setSelectedTemplateName('')
      setTemplateName('')
      return
    }
    const selectedTemplate = importTemplates.find((template) => template.id === selectedImportTemplateId)
    if (!selectedTemplate) return
    setSelectedTemplateName(selectedTemplate.name)
  }, [importTemplateLoadFailed, importTemplates, selectedImportTemplateId])

  const { canConfirm: canConfirmMapping, missingFieldsHint } = useMemo(() => {
    const isCombined = mappingValue.dimensionMode === 'combined'
    const missing: string[] = []
    let canConfirm = true
    if (isCombined) {
      if (!mappingValue.combinedColumn) {
        missing.push(labels.mappingMissingDimensions)
        canConfirm = false
      }
    } else {
      if (!mappingValue.mapping.length) { missing.push(labels.mappingMissingLength); canConfirm = false }
      if (!mappingValue.mapping.width) { missing.push(labels.mappingMissingWidth); canConfirm = false }
      if (!mappingValue.mapping.height) { missing.push(labels.mappingMissingHeight); canConfirm = false }
    }
    const hasQuantity = mappingValue.mapping.quantity !== '' || (mappingValue.defaults.quantity ?? 0) > 0
    if (!hasQuantity) {
      missing.push(labels.mappingMissingQuantity)
      canConfirm = false
    }
    return {
      canConfirm,
      missingFieldsHint: missing.length > 0
        ? `${labels.mappingRequiredHint}: ${missing.join(', ')}`
        : labels.mappingConfirmReady,
    }
  }, [mappingValue, labels])

  const handleImportMappingChange = (next: ImportMappingValue) => {
    const applied = applyMappingDefaults(next)
    setMappingValue(applied)
    setMissingImportColumns(selectionMode === 'existing'
      ? missingMappedColumns(applied, importColumnsForHeaderRow(importRows, applied.headerRow))
      : [])
  }

  const abandonTemplateWrite = () => {
    writeGenerationRef.current += 1
    pendingTemplateWriteRef.current = null
    setPendingTemplateWrite(null)
  }

  const selectNone = () => {
    const next = emptyImportMappingValue()
    abandonTemplateWrite()
    setSelectionMode('none')
    setPhase('mapping-preview')
    setMappingValue(next)
    setMappingBaseline(next)
    setSelectedImportTemplateId('')
    setSelectedTemplateName('')
    retainSelectedIdRef.current = null
    setTemplateName('')
    setTemplateSaveNotice('')
    setTemplateWriteError('')
    setMissingImportColumns([])
  }

  const selectTemplate = (templateId: string) => {
    const template = importTemplates.find(item => item.id === templateId)
    if (!template) return
    const next = applyMappingDefaults(importMappingValueFromTemplate(template))
    abandonTemplateWrite()
    setSelectionMode('existing')
    setPhase('mapping-preview')
    setMappingValue(next)
    setMappingBaseline(next)
    setSelectedImportTemplateId(template.id)
    setSelectedTemplateName(template.name)
    retainSelectedIdRef.current = null
    setTemplateName('')
    setTemplateSaveNotice('')
    setTemplateWriteError('')
    setMissingImportColumns(missingMappedColumns(next, importColumnsForHeaderRow(importRows, next.headerRow)))
  }

  const mappingPayload = (name: string): ImportTemplatePayload => ({
    name,
    mapping: mappingValue.mapping,
    units: mappingValue.units as ImportTemplateUnits,
    headerRow: mappingValue.headerRow,
    startRow: mappingValue.startRow,
    mergeRows: 'none',
    dimensionMode: mappingValue.dimensionMode,
    combinedColumn: mappingValue.combinedColumn || mappingValue.mapping.dimensions || '',
    dimensionOrder: mappingValue.dimensionOrder,
    defaultValues: mappingValue.defaults,
  })

  const templateWriteErrorMessage = (error: unknown): string => {
    if (error instanceof ImportTemplateRequestError) {
      if (error.code === 'duplicate-name') return labels.templateNameDuplicate
      if (error.code === 'invalid-template') return labels.templateConfigInvalid
    }
    return labels.templateSaveFailed
  }

  const runTemplateWrite = async (
    action: TemplateWriteAction,
    execute: () => Promise<ImportTemplate | null>,
    notice: string,
  ): Promise<void> => {
    if (pendingTemplateWriteRef.current) return
    if (!validateImportMappingValue(mappingValue, importColumnsForHeaderRow(importRows, mappingValue.headerRow)).valid) {
      setTemplateWriteError(labels.templateConfigInvalid)
      return
    }
    const generation = writeGenerationRef.current
    pendingTemplateWriteRef.current = action
    setPendingTemplateWrite(action)
    setTemplateWriteError('')
    setTemplateSaveNotice('')
    try {
      const saved = await execute()
      if (writeGenerationRef.current !== generation) return
      if (!saved) return
      setSelectedTemplateName(saved.name)
      retainSelectedIdRef.current = saved.id
      setSelectedImportTemplateId(saved.id)
      setSelectionMode('existing')
      setMappingBaseline(applyMappingDefaults(importMappingValueFromTemplate(saved)))
      setTemplateName('')
      setTemplateSaveNotice(`${notice}: ${saved.name}`)
    } catch (error) {
      if (writeGenerationRef.current !== generation) return
      setTemplateWriteError(templateWriteErrorMessage(error))
    } finally {
      if (writeGenerationRef.current === generation) {
        pendingTemplateWriteRef.current = null
        setPendingTemplateWrite(null)
      }
    }
  }

  const handleCreateTemplate = async (name: string): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      setTemplateWriteError(labels.templateNameRequired)
      return
    }
    if (importTemplates.some(template => template.name === trimmed)) {
      setTemplateWriteError(labels.templateNameDuplicate)
      return
    }
    await runTemplateWrite('create', () => onCreateTemplate(mappingPayload(trimmed)), labels.templateSaved)
  }

  const handleUpdateTemplate = async (): Promise<void> => {
    const originalName = importTemplates.find(template => template.id === selectedImportTemplateId)?.name
      ?? selectedTemplateName
    if (!selectedImportTemplateId || !originalName) return
    await runTemplateWrite(
      'update',
      () => onUpdateTemplate(selectedImportTemplateId, mappingPayload(originalName)),
      labels.templateUpdated,
    )
  }

  const handleSaveTemplateCopy = async (name: string): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      setTemplateWriteError(labels.templateNameRequired)
      return
    }
    const originalName = importTemplates.find(template => template.id === selectedImportTemplateId)?.name
      ?? selectedTemplateName
    if (trimmed === originalName) {
      setTemplateWriteError(labels.templateNameUnchanged)
      return
    }
    if (importTemplates.some(template => template.name === trimmed)) {
      setTemplateWriteError(labels.templateNameDuplicate)
      return
    }
    await runTemplateWrite('copy', () => onCreateTemplate(mappingPayload(trimmed)), labels.templateSaved)
  }

  const pendingImport = useMemo(() => parseCargoRowsWithTemplate(importRows, {
    mapping: mappingValue.mapping,
    units: mappingValue.units,
    headerRow: mappingValue.headerRow,
    startRow: mappingValue.startRow,
    mergeRows: 'none',
    dimensionMode: mappingValue.dimensionMode,
    combinedColumn: mappingValue.combinedColumn,
    dimensionOrder: mappingValue.dimensionOrder,
    defaultValues: mappingValue.defaults,
  }, { colors: colors as string[] }), [colors, importRows, mappingValue])

  const availableColumns = importColumnsForHeaderRow(importRows, mappingValue.headerRow)
  const mappingValidation = validateImportMappingValue(mappingValue, availableColumns)

  const confirmMappingImport = () => {
    if (!mappingValidation.valid || pendingImport.errors.length > 0) return
    const messages = buildImportMessages(pendingImport, labels, locale)
    onConfirm(pendingImport.items, messages)
    saveLastImportConfig(userId, {
      mapping: mappingValue.mapping,
      units: mappingValue.units,
      headerRow: mappingValue.headerRow,
      startRow: mappingValue.startRow,
      dimensionMode: mappingValue.dimensionMode,
      combinedColumn: mappingValue.combinedColumn,
      dimensionOrder: mappingValue.dimensionOrder,
      defaults: mappingValue.defaults,
    })
    if (pendingImport.items.length > 0 && selectedImportTemplateId) {
      try { localStorage.setItem('cargo_last_used_template_id', selectedImportTemplateId) } catch { /* ignore */ }
    }
  }

  const previewRows = importPreviewRows(importRows, mappingValue.headerRow, mappingValue.startRow).slice(0, 5)
  const onMappingPreview = phase === 'mapping-preview'
  const mappingDirty = !sameImportMappingValue(mappingValue, mappingBaseline)
  const canWriteTemplate = mappingValidation.valid
  const writeBusy = pendingTemplateWrite !== null
  const hasSelectedTemplate = selectedImportTemplateId !== ''
  const displayedSelectedName = importTemplates.find(template => template.id === selectedImportTemplateId)?.name
    ?? selectedTemplateName
  const showCreateTemplate = !hasSelectedTemplate
  const showExistingWrites = hasSelectedTemplate && mappingDirty

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      data-testid="mapping-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mapping-modal-title"
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={handleDialogKeyDown}
    >
      <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="mapping-modal-title" className="text-xl font-bold text-slate-800">
              {onMappingPreview ? labels.mappingTitle : labels.templateSelectionTitle}
            </h3>
            {onMappingPreview && (
              <p className="mt-1 text-sm text-slate-500">{labels.mappingSubtitle}</p>
            )}
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600" data-testid="mapping-stats">
            {labels.mappingTotalRows}: {importRows.length} / {Object.keys(importRows[0] ?? {}).length} {labels.mappingTotalCols}
          </div>
        </div>
        {!onMappingPreview ? (
          <TemplateSelectionPanel
            templates={importTemplates}
            loadFailed={importTemplateLoadFailed}
            labels={labels}
            onSelectNone={selectNone}
            onSelectTemplate={selectTemplate}
            onRetry={onRefreshTemplates}
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                type="button"
                data-testid="template-selection-back"
                onClick={() => {
                  abandonTemplateWrite()
                  setPhase('template-selection')
                  setSelectionMode(null)
                }}
              >
                {labels.templateSelectionBack}
              </button>
            </div>
            <div className="mb-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-[1fr_auto]" data-testid="import-template-controls">
              {hasSelectedTemplate && (
                <div className="md:col-span-2 font-semibold text-slate-700" data-testid="selected-import-template-name">
                  {displayedSelectedName}
                </div>
              )}
              {showCreateTemplate && (
                <>
                  <label className="font-semibold text-slate-700">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className="text-red-600">*</span>
                      <span className="sr-only">{labels.mappingRequiredField}</span>
                      {labels.templateName}
                    </span>
                    <input
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={templateName}
                      data-testid="import-template-name"
                      onChange={event => setTemplateName(event.target.value)}
                    />
                  </label>
                  <button
                    className="self-end rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    data-testid="save-import-template"
                    disabled={writeBusy || !canWriteTemplate}
                    onClick={() => { void handleCreateTemplate(templateName) }}
                  >
                    {labels.templateSave}
                  </button>
                </>
              )}
              {showExistingWrites && (
                <>
                  <button
                    className="self-end rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    data-testid="update-import-template"
                    disabled={writeBusy || !canWriteTemplate}
                    onClick={() => { void handleUpdateTemplate() }}
                  >
                    {labels.templateUpdateExplicit}
                  </button>
                  <label className="font-semibold text-slate-700 md:col-span-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className="text-red-600">*</span>
                      <span className="sr-only">{labels.mappingRequiredField}</span>
                      {labels.templateSaveAsName}
                    </span>
                    <input
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={templateName}
                      data-testid="import-template-save-as-name"
                      onChange={event => setTemplateName(event.target.value)}
                    />
                  </label>
                  <button
                    className="self-end rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    data-testid="save-as-import-template"
                    disabled={writeBusy || !canWriteTemplate}
                    onClick={() => { void handleSaveTemplateCopy(templateName) }}
                  >
                    {labels.templateSaveAs}
                  </button>
                </>
              )}
              {templateWriteError && (
                <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800" data-testid="template-write-error">
                  {templateWriteError}
                </div>
              )}
              {templateSaveNotice && (
                <div className="md:col-span-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" data-testid="template-save-status">
                  {templateSaveNotice}
                </div>
              )}
            </div>
            <ImportMappingForm
              value={mappingValue}
              onChange={handleImportMappingChange}
              availableColumns={availableColumns}
              labels={labels as never}
              missingColumns={missingImportColumns}
              duplicateColumns={mappingValidation.duplicateColumns}
              previewSlot={(
                <div className="space-y-3">
                  <div className="rounded-md border border-slate-200 bg-white p-3 text-xs" data-testid="mapping-parse-summary">
                    <div className="font-semibold text-slate-700">
                      {locale === 'zh' ? '解析预览' : 'Parse preview'}: {pendingImport.summary.importedRows} ok / {pendingImport.errors.length} err / {pendingImport.warnings.length} warn
                    </div>
                    {pendingImport.errors.slice(0, 3).map((issue) => (
                      <p className="mt-1 text-red-700" key={`err-${issue.row}-${issue.code}`}>R{issue.row}: {issue.message}</p>
                    ))}
                    {pendingImport.items.slice(0, 3).map((item) => (
                      <p className="mt-1 text-slate-600" key={item.id}>
                        {item.label} {item.name}: {item.length}×{item.width}×{item.height} mm, {item.weight} kg ×{item.quantity}
                      </p>
                    ))}
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="mapping-preview">
                    <div className="mb-2 text-sm font-semibold text-slate-700">{labels.mappingPreview}</div>
                    <div className="max-h-[420px] overflow-auto">
                      <table className="min-w-full border-collapse text-xs">
                        <thead className="sticky top-0 bg-slate-100">
                          <tr>
                            {availableColumns.map(col => (
                              <th key={col} className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-700 whitespace-nowrap">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, rowIndex) => (
                            <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
                              {availableColumns.map(col => (
                                <td key={col} className="border border-slate-200 px-2 py-1 text-slate-700 whitespace-nowrap">
                                  {row[col] === undefined || row[col] === null ? '' : String(row[col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            />
          </>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {onMappingPreview && (mappingValue.units.length === 'cm' || mappingValue.units.width === 'cm' || mappingValue.units.height === 'cm') && (
            <span className="mr-auto text-xs font-semibold text-amber-600" data-testid="mapping-convert-hint">
              {labels.mappingConvertHint}
            </span>
          )}
          <button
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
            type="button"
            onClick={onClose}
          >
            {labels.mappingCancel}
          </button>
          {onMappingPreview && !canConfirmMapping && (
            <span className="mr-auto text-xs font-semibold text-amber-600" data-testid="mapping-missing-hint">
              {missingFieldsHint}
            </span>
          )}
          {onMappingPreview && pendingImport.errors.length > 0 && (
            <span className="mr-auto text-xs font-semibold text-red-600" data-testid="mapping-error-hint">
              {locale === 'zh' ? '存在错误行，无法确认导入' : 'Error rows present; confirm is blocked'}
            </span>
          )}
          {onMappingPreview && (
            <button
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              data-testid="confirm-mapping"
              disabled={!canConfirmMapping || !mappingValidation.valid || pendingImport.errors.length > 0}
              onClick={confirmMappingImport}
            >
              {labels.mappingConfirm}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
