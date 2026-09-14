import type { ImportTemplate } from '../types'

export type TemplateSelectionPanelLabels = {
  templateSelectionTitle: string
  templateSelectionEmpty: string
  templateUseWithout: string
  importTemplateLoadFailed: string
  importTemplateRetry: string
}

export type TemplateSelectionPanelProps = {
  templates: ImportTemplate[]
  loadFailed: boolean
  labels: TemplateSelectionPanelLabels
  onSelectNone: () => void
  onSelectTemplate: (templateId: string) => void
  onRetry: () => void
}

export function TemplateSelectionPanel({
  templates,
  loadFailed,
  labels,
  onSelectNone,
  onSelectTemplate,
  onRetry,
}: TemplateSelectionPanelProps) {
  return (
    <div className="space-y-4" data-testid="template-selection-panel">
      <h3 className="text-lg font-bold text-slate-800">{labels.templateSelectionTitle}</h3>
      {loadFailed ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          <span>{labels.importTemplateLoadFailed}</span>
          <button className="archive-button secondary" type="button" onClick={onRetry}>
            {labels.importTemplateRetry}
          </button>
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-slate-500">{labels.templateSelectionEmpty}</p>
      ) : (
        <div className="grid gap-2">
          {templates.map((template) => (
            <button
              key={template.id}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
              type="button"
              data-testid={`template-selection-item-${template.id}`}
              onClick={() => onSelectTemplate(template.id)}
            >
              {template.name}
            </button>
          ))}
        </div>
      )}
      <button
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        type="button"
        data-testid="use-without-template"
        onClick={onSelectNone}
      >
        {labels.templateUseWithout}
      </button>
    </div>
  )
}
