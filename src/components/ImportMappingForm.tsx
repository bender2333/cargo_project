import type { ReactNode } from 'react'
import { HelpTooltip } from './HelpTooltip'
import type { ImportTemplateDefaults } from '../types'

export type MappingDimensionUnit = 'auto' | 'mm' | 'cm'
export type MappingDimensionKey = 'length' | 'width' | 'height'

export type ImportMappingValue = {
  mapping: Record<string, string>
  units: Record<MappingDimensionKey, MappingDimensionUnit>
  headerRow: number
  startRow: number
  dimensionMode: 'separate' | 'combined'
  combinedColumn: string
  dimensionOrder: MappingDimensionKey[]
  defaults: ImportTemplateDefaults
}

// Strings the form needs. Workbench's per-locale `t` object structurally
// satisfies this, so callers pass `labels={t}` without rebuilding a slice.
export type ImportMappingFormLabels = {
  templateHeaderRow: string
  templateStartRow: string
  templateHelpHeaderRow: string
  templateHelpStartRow: string
  templateDefaultLabel: string
  templateDefaultQuantity: string
  templateDefaultColor: string
  templateDefaultRotate: string
  templateDefaultStackable: string
  templateDefaultMaxStackLayers: string
  templateDefaultGroundOnly: string
  templateDefaultLoadingPriority: string
  templateDimensionMode: string
  templateHelpDimensionMode: string
  templateDimensionSeparate: string
  templateDimensionCombined: string
  templateCombinedColumn: string
  templateHelpCombinedColumn: string
  templateDimensionOrder: string
  templateDimensionOrderLWH: string
  templateDimensionOrderLHW: string
  templateDimensionOrderWLH: string
  templateDimensionOrderWHL: string
  templateDimensionOrderHLW: string
  templateDimensionOrderHWL: string
  templateHelpLabelColumn: string
  mappingSelectColumn: string
  mappingFieldLabel: string
  mappingFieldName: string
  mappingFieldLength: string
  mappingFieldWidth: string
  mappingFieldHeight: string
  mappingFieldWeight: string
  mappingFieldQuantity: string
  mappingFieldGroundOnly: string
  mappingFieldLoadingPriority: string
  color: string
  rotate: string
  stackable: string
  groundOnly: string
  loadingFirst: string
  loadingNormal: string
  maxStackLayers: string
  mappingUnit: string
  mappingAutoUnit: string
  mappingConvertHint: string
}

// Fixed, ordered field set so the import dialog and the template manager page
// render the exact same mapping controls (the unification this component exists for).
const FIELD_KEYS = [
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
  'loadingPriority',
] as const

const DIMENSION_FIELDS: Record<string, MappingDimensionKey> = { length: 'length', width: 'width', height: 'height' }

type Props = {
  value: ImportMappingValue
  onChange: (next: ImportMappingValue) => void
  availableColumns: string[]
  labels: ImportMappingFormLabels
  testIdPrefix?: string
  previewSlot?: ReactNode
  missingColumns?: string[]
}

export function ImportMappingForm({ value, onChange, availableColumns, labels, testIdPrefix = '', previewSlot, missingColumns = [] }: Props) {
  const tid = (id: string) => `${testIdPrefix}${id}`

  // Keep already-selected columns selectable even when the live header list does
  // not contain them (e.g. editing a saved template before loading a sample file).
  const usedValues = [value.combinedColumn, value.mapping.dimensions, ...FIELD_KEYS.map((field) => value.mapping[field] ?? '')].filter(Boolean)
  const columns = Array.from(new Set([...availableColumns, ...usedValues]))
  const missingColumnSet = new Set(missingColumns.map((column) => column.trim()).filter(Boolean))
  const missingColumnMessage = 'Column not found in file / 列在文件中未找到'
  const inputClass = (invalid: boolean) => `mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-1 ${invalid ? 'border-red-500 ring-1 ring-red-400 focus:border-red-500 focus:ring-red-400' : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-500'}`
  const columnMissing = (column: string | undefined) => {
    const trimmed = column?.trim() ?? ''
    return trimmed !== '' && missingColumnSet.has(trimmed)
  }

  const fieldLabel: Record<string, string> = {
    label: labels.mappingFieldLabel,
    name: labels.mappingFieldName,
    length: labels.mappingFieldLength,
    width: labels.mappingFieldWidth,
    height: labels.mappingFieldHeight,
    weight: labels.mappingFieldWeight,
    quantity: labels.mappingFieldQuantity,
    color: labels.color,
    canRotate: labels.rotate,
    stackable: labels.stackable,
    maxStackLayers: labels.maxStackLayers,
    groundOnly: labels.mappingFieldGroundOnly,
    loadingPriority: labels.mappingFieldLoadingPriority,
  }

  const patchDefaults = (partial: Partial<ImportTemplateDefaults>) =>
    onChange({ ...value, defaults: { ...value.defaults, ...partial } })

  const fieldList = (
    <div className="space-y-3" data-testid={tid('mapping-fields')}>
      {FIELD_KEYS.map((fieldKey) => {
        const dimensionKey = DIMENSION_FIELDS[fieldKey]
        // Combined mode supplies L/W/H from the combined column + split order,
        // so the standalone dimension selectors are redundant.
        if (value.dimensionMode === 'combined' && dimensionKey) {
          return null
        }
        const fieldMissing = columnMissing(value.mapping[fieldKey])
        return (
          <div key={fieldKey} className="rounded-md border border-slate-200 bg-white p-3">
            <label className="block text-sm font-semibold text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                {fieldLabel[fieldKey] || fieldKey}
                {fieldKey === 'label' && <HelpTooltip text={labels.templateHelpLabelColumn} testId={tid('help-tooltip-label-column')} />}
              </span>
              <input
                className={inputClass(fieldMissing)}
                value={value.mapping[fieldKey] ?? ''}
                list={tid(`map-options-${fieldKey}`)}
                placeholder={labels.mappingSelectColumn}
                onChange={(event) => onChange({ ...value, mapping: { ...value.mapping, [fieldKey]: event.target.value } })}
                data-testid={tid(`map-select-${fieldKey}`)}
                data-invalid={fieldMissing ? 'true' : undefined}
              />
              <datalist id={tid(`map-options-${fieldKey}`)}>
                {columns.map((col) => (
                  <option key={col} value={col} />
                ))}
              </datalist>
            </label>
            {fieldMissing && (
              <p className="mt-1 text-xs font-semibold text-red-600">{missingColumnMessage}</p>
            )}
            {dimensionKey && (
              <label className="mt-2 block text-xs font-semibold text-slate-600">
                {labels.mappingUnit}
                <select
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={value.units[dimensionKey]}
                  onChange={(event) => onChange({ ...value, units: { ...value.units, [dimensionKey]: event.target.value as MappingDimensionUnit } })}
                  data-testid={tid(`map-unit-${fieldKey}`)}
                >
                  <option value="auto">{labels.mappingAutoUnit}</option>
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                </select>
                {value.units[dimensionKey] === 'cm' && (
                  <span className="mt-1 inline-block text-[11px] font-medium text-amber-600">{labels.mappingConvertHint}</span>
                )}
              </label>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      <div className="mb-4 grid gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm md:grid-cols-4" data-testid={tid('import-template-manager')}>
        <label className="font-semibold text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            {labels.templateHeaderRow}
            <HelpTooltip text={labels.templateHelpHeaderRow} testId={tid('help-tooltip-header-row')} />
          </span>
          <input
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            type="number"
            min={1}
            value={value.headerRow}
            data-testid={tid('template-header-row')}
            onChange={(event) => onChange({ ...value, headerRow: Math.max(1, Number(event.target.value) || 1) })}
          />
        </label>
        <label className="font-semibold text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            {labels.templateStartRow}
            <HelpTooltip text={labels.templateHelpStartRow} testId={tid('help-tooltip-start-row')} />
          </span>
          <input
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            type="number"
            min={2}
            value={value.startRow}
            data-testid={tid('template-start-row')}
            onChange={(event) => onChange({ ...value, startRow: Math.max(2, Number(event.target.value) || 2) })}
          />
        </label>
        <label className="font-semibold text-slate-700">
          {labels.templateDefaultLabel}
          <input
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={value.defaults.label ?? ''}
            data-testid={tid('template-default-label')}
            onChange={(event) => patchDefaults({ label: event.target.value })}
          />
        </label>
        <label className="font-semibold text-slate-700">
          {labels.templateDefaultQuantity}
          <input
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            type="number"
            min={1}
            value={value.defaults.quantity ?? 1}
            data-testid={tid('template-default-quantity')}
            onChange={(event) => patchDefaults({ quantity: Math.max(1, Number(event.target.value) || 1) })}
          />
        </label>
        <label className="font-semibold text-slate-700">
          {labels.templateDefaultColor}
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white"
            type="color"
            value={value.defaults.color ?? '#f59e0b'}
            data-testid={tid('template-default-color')}
            onChange={(event) => patchDefaults({ color: event.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={value.defaults.canRotate ?? true}
            data-testid={tid('template-default-rotate')}
            onChange={(event) => patchDefaults({ canRotate: event.target.checked })}
          />
          {labels.templateDefaultRotate}
        </label>
        <label className="flex items-center gap-2 font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={value.defaults.stackable ?? true}
            data-testid={tid('template-default-stackable')}
            onChange={(event) => patchDefaults({ stackable: event.target.checked, maxStackLayers: event.target.checked ? value.defaults.maxStackLayers : undefined })}
          />
          {labels.templateDefaultStackable}
        </label>
        {(value.defaults.stackable ?? true) && (
          <label className="font-semibold text-slate-700">
            {labels.templateDefaultMaxStackLayers}
            <input
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              type="number"
              min={1}
              value={value.defaults.maxStackLayers ?? ''}
              data-testid={tid('template-default-max-stack-layers')}
              onChange={(event) => {
                const parsed = Math.floor(Number(event.target.value) || 0)
                patchDefaults({ maxStackLayers: parsed > 0 ? parsed : undefined })
              }}
            />
          </label>
        )}
        <label className="flex items-center gap-2 pt-7 font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={value.defaults.groundOnly ?? false}
            data-testid={tid('template-default-ground-only')}
            onChange={(event) => patchDefaults({ groundOnly: event.target.checked })}
          />
          {labels.templateDefaultGroundOnly}
        </label>
        <label className="font-semibold text-slate-700">
          {labels.templateDefaultLoadingPriority}
          <select
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={value.defaults.loadingPriority ?? 'normal'}
            data-testid={tid('template-default-loading-priority')}
            onChange={(event) => patchDefaults({ loadingPriority: event.target.value as ImportTemplateDefaults['loadingPriority'] })}
          >
            <option value="normal">{labels.loadingNormal}</option>
            <option value="first">{labels.loadingFirst}</option>
          </select>
        </label>
        <label className="font-semibold text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            {labels.templateDimensionMode}
            <HelpTooltip text={labels.templateHelpDimensionMode} testId={tid('help-tooltip-dimension-mode')} />
          </span>
          <select
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={value.dimensionMode}
            data-testid={tid('template-dimension-mode')}
            onChange={(event) => onChange({ ...value, dimensionMode: event.target.value as 'separate' | 'combined' })}
          >
            <option value="separate">{labels.templateDimensionSeparate}</option>
            <option value="combined">{labels.templateDimensionCombined}</option>
          </select>
        </label>
        {value.dimensionMode === 'combined' && (() => {
          const combinedMissing = columnMissing(value.combinedColumn)
          return (
            <div>
              <label className="font-semibold text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  {labels.templateCombinedColumn}
                  <HelpTooltip text={labels.templateHelpCombinedColumn} testId={tid('help-tooltip-combined-column')} />
                </span>
                <input
                  className={inputClass(combinedMissing)}
                  value={value.combinedColumn}
                  list={tid('combined-column-options')}
                  placeholder={labels.mappingSelectColumn}
                  data-testid={tid('template-combined-column')}
                  data-invalid={combinedMissing ? 'true' : undefined}
                  onChange={(event) => onChange({ ...value, combinedColumn: event.target.value, mapping: { ...value.mapping, dimensions: event.target.value } })}
                />
                <datalist id={tid('combined-column-options')}>
                  {columns.map((col) => (
                    <option key={col} value={col} />
                  ))}
                </datalist>
              </label>
              {combinedMissing && (
                <p className="mt-1 text-xs font-semibold text-red-600">{missingColumnMessage}</p>
              )}
              <label className="font-semibold text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  {labels.templateDimensionOrder}
                </span>
                <select
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  value={value.dimensionOrder.join(',')}
                  data-testid={tid('template-dimension-order')}
                  onChange={(event) => onChange({ ...value, dimensionOrder: event.target.value.split(',').filter(Boolean) as MappingDimensionKey[] })}
                >
                  <option value="length,width,height">{labels.templateDimensionOrderLWH}</option>
                  <option value="length,height,width">{labels.templateDimensionOrderLHW}</option>
                  <option value="width,length,height">{labels.templateDimensionOrderWLH}</option>
                  <option value="width,height,length">{labels.templateDimensionOrderWHL}</option>
                  <option value="height,length,width">{labels.templateDimensionOrderHLW}</option>
                  <option value="height,width,length">{labels.templateDimensionOrderHWL}</option>
                </select>
              </label>
            </div>
          )
        })()}
      </div>
      {previewSlot ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fieldList}
          {previewSlot}
        </div>
      ) : (
        fieldList
      )}
    </>
  )
}
