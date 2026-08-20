import { useEffect, useMemo, useRef, useState } from 'react'
import { ImportMappingForm } from './ImportMappingForm'
import type { ImportMappingValue } from './ImportMappingForm'
import { TemplateSelectionPanel, type TemplateSelectionPanelLabels } from './TemplateSelectionPanel'
import type { CargoItem, ImportTemplate, ImportTemplateDefaults, ImportTemplateUnits, Locale } from '../types'
import type { ImportTemplatePayload } from '../api/importTemplates'
import { importColumnsForHeaderRow, importPreviewRows } from '../lib/importTable'
import type { ImportCargoRow } from '../lib/importCargo'
import { parseCargoRowsWithTemplate } from '../lib/importCargo'
import { saveLastImportConfig } from '../lib/lastImportConfig'
import {
  emptyImportMappingValue,
  importMappingValueFromTemplate,
  missingMappedColumns,
  buildImportMessages,
} from '../lib/importWorkflow'
import type { BuildImportMessagesLabels } from '../lib/importWorkflow'
import { reconcileSelectedTemplateName, shouldClearTemplateReference } from '../hooks/useTemplateCatalogs'

export type ImportPhase = 'template-selection' | 'mapping-preview'
export type TemplateSelectionMode = 'none' | 'existing'

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
  const selectedImportTemplateNameRef = useRef<{ id: string; name: string } | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateSaveNotice, setTemplateSaveNotice] = useState('')
  const [missingImportColumns, setMissingImportColumns] = useState<string[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPhase('template-selection')
    setSelectionMode(null)
    setMappingValue(emptyImportMappingValue())
    setSelectedImportTemplateId('')
    selectedImportTemplateNameRef.current = null
    setTemplateName('')
    setTemplateSaveNotice('')
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
      selectedImportTemplateNameRef.current = null
      return
    }
    if (importTemplateLoadFailed) return
    if (shouldClearTemplateReference(selectedImportTemplateId, importTemplates, importTemplateLoadFailed)) {
      setSelectedImportTemplateId('')
      setTemplateName('')
      selectedImportTemplateNameRef.current = null
      return
    }
    const selectedTemplate = importTemplates.find((template) => template.id === selectedImportTemplateId)
    if (!selectedTemplate) return
    const previousTemplate = selectedImportTemplateNameRef.current
    setTemplateName((current) => reconcileSelectedTemplateName(current, previousTemplate, selectedTemplate))
    selectedImportTemplateNameRef.current = { id: selectedTemplate.id, name: selectedTemplate.name }
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

  const selectNone = () => {
    const next = emptyImportMappingValue()
    setSelectionMode('none')
    setPhase('mapping-preview')
    setMappingValue(next)
    setSelectedImportTemplateId('')
    selectedImportTemplateNameRef.current = null
    setTemplateName('')
    setTemplateSaveNotice('')
    setMissingImportColumns([])
  }

  const selectTemplate = (templateId: string) => {
    const template = importTemplates.find(item => item.id === templateId)
    if (!template) return
    const next = applyMappingDefaults(importMappingValueFromTemplate(template))
    setSelectionMode('existing')
    setPhase('mapping-preview')
    setMappingValue(next)
    setSelectedImportTemplateId(template.id)
    selectedImportTemplateNameRef.current = { id: template.id, name: template.name }
    setTemplateName(template.name)
    setTemplateSaveNotice('')
    setMissingImportColumns(missingMappedColumns(next, importColumnsForHeaderRow(importRows, next.headerRow)))
  }

  const handleSaveImportTemplate = async () => {
    const name = templateName.trim()
    if (!name) return
    const selected = importTemplates.find(t => t.id === selectedImportTemplateId)
    const isUpdate = !!(selectedImportTemplateId && selected && name === selected.name)
    const payload = {
      name,
      mapping: mappingValue.mapping,
      units: mappingValue.units as ImportTemplateUnits,
      headerRow: mappingValue.headerRow,
      startRow: mappingValue.startRow,
      mergeRows: 'none' as const,
      dimensionMode: mappingValue.dimensionMode,
      combinedColumn: mappingValue.combinedColumn || mappingValue.mapping.dimensions || '',
      dimensionOrder: mappingValue.dimensionOrder,
      defaultValues: mappingValue.defaults,
    }
    setTemplateSaveNotice('')
    try {
      const saved = isUpdate
        ? await onUpdateTemplate(selected.id, payload)
        : await onCreateTemplate(payload)
      if (!saved) return
      selectedImportTemplateNameRef.current = { id: saved.id, name: saved.name }
      setSelectedImportTemplateId(saved.id)
      try { localStorage.setItem('cargo_last_used_template_id', saved.id) } catch { /* ignore */ }
      const noticeText = isUpdate ? labels.templateUpdated : labels.templateSaved
      setTemplateSaveNotice(`${noticeText}: ${saved.name}`)
    } catch (err) {
      console.error(err)
      alert(locale === 'zh' ? '保存模板失败' : 'Failed to save template')
    }
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

  const confirmMappingImport = () => {
    if (pendingImport.errors.length > 0) return
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

  const availableColumns = importColumnsForHeaderRow(importRows, mappingValue.headerRow)
  const previewRows = importPreviewRows(importRows, mappingValue.headerRow, mappingValue.startRow).slice(0, 5)
  const onMappingPreview = phase === 'mapping-preview'

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
                  setPhase('template-selection')
                  setSelectionMode(null)
                }}
              >
                {labels.templateSelectionBack}
              </button>
            </div>
            <div className="mb-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-[1fr_auto]" data-testid="import-template-controls">
              <label className="font-semibold text-slate-700">
                {labels.templateName}
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
                disabled={!templateName.trim()}
                onClick={() => { void handleSaveImportTemplate() }}
              >
                {labels.templateSave}
              </button>
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
              disabled={!canConfirmMapping || pendingImport.errors.length > 0}
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
