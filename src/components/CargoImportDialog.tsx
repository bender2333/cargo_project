import { useEffect, useMemo, useRef, useState } from 'react'
import { ImportMappingForm } from './ImportMappingForm'
import type { ImportMappingValue } from './ImportMappingForm'
import type { CargoItem, ImportTemplate, ImportTemplateDefaults, ImportTemplateUnits, Locale } from '../types'
import type { ImportTemplatePayload } from '../api/importTemplates'
import { importColumnsForHeaderRow, importPreviewRows } from '../lib/importTable'
import type { ImportCargoRow } from '../lib/importCargo'
import { parseCargoRowsWithTemplate } from '../lib/importCargo'
import { saveLastImportConfig } from '../lib/lastImportConfig'
import {
  preSelectCol,
  importMappingValueFromTemplate,
  missingMappedColumns,
  IMPORT_REQUIRED_FIELDS,
  buildImportMessages,
} from '../lib/importWorkflow'
import type { BuildImportMessagesLabels } from '../lib/importWorkflow'
import { reconcileSelectedTemplateName, shouldClearTemplateReference } from '../hooks/useTemplateCatalogs'

type DimensionUnit = 'auto' | 'mm' | 'cm'

// Omit fields with non-string types (like nav: string[]) from the index signature
type Labels = BuildImportMessagesLabels & {
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
  importTemplateLoadFailed: string
  importTemplateRetry: string
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

const EMPTY_MAPPING: Record<string, string> = {
  label: '', name: '', length: '', width: '', height: '', weight: '',
  quantity: '', color: '', canRotate: '', stackable: '', maxStackLayers: '',
  groundOnly: '', dimensions: '',
}

const EMPTY_UNITS: Record<'length' | 'width' | 'height', DimensionUnit> = {
  length: 'auto', width: 'auto', height: 'auto',
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
  const [customMapping, setCustomMapping] = useState<Record<string, string>>(() => {
    const rowKeys = importColumnsForHeaderRow(importRows, 1)
    const initialMap: Record<string, string> = { ...EMPTY_MAPPING }
    IMPORT_REQUIRED_FIELDS.forEach(field => {
      initialMap[field] = preSelectCol(field, rowKeys)
    })
    return initialMap
  })
  const [customUnits, setCustomUnits] = useState<Record<'length' | 'width' | 'height', DimensionUnit>>(EMPTY_UNITS)
  const [templateDimensionMode, setTemplateDimensionMode] = useState<'separate' | 'combined'>('separate')
  const [templateCombinedColumn, setTemplateCombinedColumn] = useState('')
  const [templateDimensionOrder, setTemplateDimensionOrder] = useState<Array<'length' | 'width' | 'height'>>(['length', 'width', 'height'])
  const [selectedImportTemplateId, setSelectedImportTemplateId] = useState('')
  const selectedImportTemplateNameRef = useRef<{ id: string; name: string } | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateHeaderRow, setTemplateHeaderRow] = useState(1)
  const [templateStartRow, setTemplateStartRow] = useState(2)
  const [templateDefaults, setTemplateDefaults] = useState<ImportTemplateDefaults>({ quantity: 1, weight: 1, canRotate: true, stackable: true })
  const [templateSaveNotice, setTemplateSaveNotice] = useState('')
  const [missingImportColumns, setMissingImportColumns] = useState<string[]>([])

  // Reconcile the selected template against the shared catalog: an authoritative
  // rename syncs the canonical name (unless the user has typed their own "save
  // as" name), and a deletion clears the now-dangling reference. A load failure
  // must not be mistaken for a deletion, so references survive it untouched.
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

  const importMappingValue: ImportMappingValue = {
    mapping: customMapping,
    units: customUnits,
    headerRow: templateHeaderRow,
    startRow: templateStartRow,
    dimensionMode: templateDimensionMode,
    combinedColumn: templateCombinedColumn,
    dimensionOrder: templateDimensionOrder,
    defaults: templateDefaults,
  }

  const { canConfirm: canConfirmMapping, missingFieldsHint } = useMemo(() => {
    const isCombined = templateDimensionMode === 'combined'
    const missing: string[] = []
    let canConfirm = true
    if (isCombined) {
      if (!templateCombinedColumn) {
        missing.push(labels.mappingMissingDimensions)
        canConfirm = false
      }
    } else {
      if (!customMapping.length) { missing.push(labels.mappingMissingLength); canConfirm = false }
      if (!customMapping.width) { missing.push(labels.mappingMissingWidth); canConfirm = false }
      if (!customMapping.height) { missing.push(labels.mappingMissingHeight); canConfirm = false }
    }
    const hasQuantity = customMapping.quantity !== '' || (templateDefaults.quantity ?? 0) > 0
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
  }, [templateDimensionMode, customMapping.length, customMapping.width, customMapping.height,
      customMapping.quantity, templateCombinedColumn, templateDefaults.quantity, labels])

  const handleImportMappingChange = (next: ImportMappingValue) => {
    setCustomMapping(next.mapping)
    setCustomUnits(next.units)
    setTemplateHeaderRow(next.headerRow)
    setTemplateStartRow(next.startRow)
    setTemplateDimensionMode(next.dimensionMode)
    setTemplateCombinedColumn(next.combinedColumn)
    setTemplateDimensionOrder(next.dimensionOrder)
    setTemplateDefaults({ quantity: 1, weight: 1, canRotate: true, stackable: true, ...next.defaults })
    setMissingImportColumns(selectedImportTemplateId
      ? missingMappedColumns(next, importColumnsForHeaderRow(importRows, next.headerRow))
      : [])
  }

  const applyImportTemplate = (templateId: string) => {
    const template = importTemplates.find(item => item.id === templateId)
    selectedImportTemplateNameRef.current = template ? { id: template.id, name: template.name } : null
    setSelectedImportTemplateId(templateId)
    setMissingImportColumns([])
    if (!template) {
      setCustomMapping(EMPTY_MAPPING)
      setCustomUnits(EMPTY_UNITS)
      setTemplateHeaderRow(1)
      setTemplateStartRow(2)
      setTemplateDimensionMode('separate')
      setTemplateCombinedColumn('')
      setTemplateDefaults({ quantity: 1, weight: 1, canRotate: true, stackable: true })
      setTemplateName('')
      setTemplateDimensionOrder(['length', 'width', 'height'])
      return
    }
    const next = importMappingValueFromTemplate(template)
    setCustomMapping(next.mapping)
    setCustomUnits(next.units)
    setTemplateHeaderRow(next.headerRow)
    setTemplateStartRow(next.startRow)
    setTemplateDimensionMode(next.dimensionMode)
    setTemplateCombinedColumn(next.combinedColumn)
    setTemplateDefaults(next.defaults)
    setTemplateName(template.name)
    setTemplateDimensionOrder(next.dimensionOrder)
    setMissingImportColumns(missingMappedColumns(next, importColumnsForHeaderRow(importRows, next.headerRow)))
  }

  const handleSaveImportTemplate = async () => {
    const name = templateName.trim()
    if (!name) return
    const selected = importTemplates.find(t => t.id === selectedImportTemplateId)
    const isUpdate = !!(selectedImportTemplateId && selected && name === selected.name)
    const payload = {
      name,
      mapping: customMapping,
      units: customUnits as ImportTemplateUnits,
      headerRow: templateHeaderRow,
      startRow: templateStartRow,
      mergeRows: 'none' as const,
      dimensionMode: templateDimensionMode,
      combinedColumn: templateCombinedColumn || customMapping.dimensions || '',
      dimensionOrder: templateDimensionOrder,
      defaultValues: templateDefaults,
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
    mapping: customMapping,
    units: customUnits,
    headerRow: templateHeaderRow,
    startRow: templateStartRow,
    mergeRows: 'none',
    dimensionMode: templateDimensionMode,
    combinedColumn: templateCombinedColumn,
    dimensionOrder: templateDimensionOrder,
    defaultValues: templateDefaults,
  }, { colors: colors as string[] }), [
    colors,
    customMapping,
    customUnits,
    importRows,
    templateCombinedColumn,
    templateDefaults,
    templateDimensionMode,
    templateDimensionOrder,
    templateHeaderRow,
    templateStartRow,
  ])

  const confirmMappingImport = () => {
    if (pendingImport.errors.length > 0) return
    const messages = buildImportMessages(pendingImport, labels, locale)
    onConfirm(pendingImport.items, messages)
    saveLastImportConfig(userId, {
      mapping: customMapping,
      units: customUnits,
      headerRow: templateHeaderRow,
      startRow: templateStartRow,
      dimensionMode: templateDimensionMode,
      combinedColumn: templateCombinedColumn,
      dimensionOrder: templateDimensionOrder,
      defaults: templateDefaults,
    })
    if (pendingImport.items.length > 0 && selectedImportTemplateId) {
      try { localStorage.setItem('cargo_last_used_template_id', selectedImportTemplateId) } catch { /* ignore */ }
    }
  }

  const availableColumns = importColumnsForHeaderRow(importRows, templateHeaderRow)
  const previewRows = importPreviewRows(importRows, templateHeaderRow, templateStartRow).slice(0, 5)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="mapping-modal" role="dialog" aria-modal="true" aria-labelledby="mapping-modal-title">
      <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200 max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="mapping-modal-title" className="text-xl font-bold text-slate-800">{labels.mappingTitle}</h3>
            <p className="mt-1 text-sm text-slate-500">{labels.mappingSubtitle}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600" data-testid="mapping-stats">
            {labels.mappingTotalRows}: {importRows.length} / {Object.keys(importRows[0] ?? {}).length} {labels.mappingTotalCols}
          </div>
        </div>
        <div className="mb-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm md:grid-cols-[1fr_1fr_auto]" data-testid="import-template-controls">
          <label className="font-semibold text-slate-700">
            {labels.templateLabel}
            <select
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              value={selectedImportTemplateId}
              data-testid="import-template-select"
              disabled={importTemplateLoadFailed}
              onChange={event => applyImportTemplate(event.target.value)}
            >
              <option value="">{labels.templateNone}</option>
              {importTemplates.map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </label>
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
            <div className="md:col-span-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800" data-testid="template-save-status">
              {templateSaveNotice}
            </div>
          )}
          {importTemplateLoadFailed && (
            <div className="md:col-span-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" data-testid="import-template-dialog-load-error">
              <span>{labels.importTemplateLoadFailed}</span>
              <button className="archive-button secondary" type="button" onClick={onRefreshTemplates}>
                {labels.importTemplateRetry}
              </button>
            </div>
          )}
        </div>
        <ImportMappingForm
          value={importMappingValue}
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
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {(customUnits.length === 'cm' || customUnits.width === 'cm' || customUnits.height === 'cm') && (
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
          {!canConfirmMapping && (
            <span className="mr-auto text-xs font-semibold text-amber-600" data-testid="mapping-missing-hint">
              {missingFieldsHint}
            </span>
          )}
          {pendingImport.errors.length > 0 && (
            <span className="mr-auto text-xs font-semibold text-red-600" data-testid="mapping-error-hint">
              {locale === 'zh' ? '存在错误行，无法确认导入' : 'Error rows present; confirm is blocked'}
            </span>
          )}
          <button
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            data-testid="confirm-mapping"
            disabled={!canConfirmMapping || pendingImport.errors.length > 0}
            onClick={confirmMappingImport}
          >
            {labels.mappingConfirm}
          </button>
        </div>
      </div>
    </div>
  )
}
