import { EXPORT_FIELD_KEYS, isExportDimensionField } from '../lib/exportPlan'
import type { ExportColumnUnit, ExportTemplateColumn } from '../types'

export type ExportColumnsEditorLabels = {
  exportColumnHeader: string
  exportColumnUnit: string
  exportAddColumn: string
  exportNoColumns: string
}

type Props = {
  columns: ExportTemplateColumn[]
  onChange: (columns: ExportTemplateColumn[]) => void
  labels: ExportColumnsEditorLabels
  testIdPrefix?: string
}

export function ExportColumnsEditor({ columns, onChange, labels, testIdPrefix = '' }: Props) {
  const tid = (id: string) => `${testIdPrefix}${id}`
  const usedFields = new Set(columns.map((col) => col.field))
  const available = EXPORT_FIELD_KEYS.filter((field) => !usedFields.has(field))

  const update = (index: number, patch: Partial<ExportTemplateColumn>) =>
    onChange(columns.map((col, i) => (i === index ? { ...col, ...patch } : col)))

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= columns.length) return
    const next = columns.slice()
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  return (
    <div className="grid gap-2" data-testid={tid('export-columns')}>
      {columns.length === 0 && <p className="text-xs text-[#94a3b8]">{labels.exportNoColumns}</p>}
      {columns.map((col, index) => (
        <div
          key={col.field}
          className="flex flex-wrap items-center gap-2 rounded border border-[#e2e8f0] bg-white p-2"
          data-testid={tid(`export-col-${col.field}`)}
        >
          <span className="min-w-[120px] font-mono text-xs font-semibold text-[#475569]">{col.field}</span>
          <input
            className="field-input flex-1"
            placeholder={labels.exportColumnHeader}
            value={col.header}
            data-testid={tid(`export-col-header-${col.field}`)}
            onChange={(event) => update(index, { header: event.target.value })}
          />
          {isExportDimensionField(col.field) && (
            <select
              className="field-input w-20"
              aria-label={labels.exportColumnUnit}
              value={col.unit ?? 'mm'}
              data-testid={tid(`export-col-unit-${col.field}`)}
              onChange={(event) => update(index, { unit: event.target.value as ExportColumnUnit })}
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
            </select>
          )}
          <button
            type="button"
            className="archive-button secondary px-2 py-1 text-xs"
            data-testid={tid(`export-col-up-${col.field}`)}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="archive-button secondary px-2 py-1 text-xs"
            data-testid={tid(`export-col-down-${col.field}`)}
            disabled={index === columns.length - 1}
            onClick={() => move(index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="archive-button px-2 py-1 text-xs text-red-700"
            data-testid={tid(`export-col-remove-${col.field}`)}
            onClick={() => onChange(columns.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </div>
      ))}
      {available.length > 0 && (
        <select
          className="field-input"
          value=""
          data-testid={tid('export-col-add')}
          onChange={(event) => {
            const field = event.target.value
            if (!field) return
            onChange([...columns, { field, header: field }])
          }}
        >
          <option value="">{labels.exportAddColumn}</option>
          {available.map((field) => (
            <option key={field} value={field}>{field}</option>
          ))}
        </select>
      )}
    </div>
  )
}
