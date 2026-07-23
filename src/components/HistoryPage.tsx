import type { HistoryPlan } from '../hooks/useHistoryPlans'

export type HistoryPageLabels = {
  title: string
  noHistory: string
  savePlan: string
  backToWorkbench: string
  shipmentName: string
  layers: string
  restore: string
  delete: string
  retry: string
  loadFailed: string
  confirmDelete: string
  saveFailed: string
  deleteFailed: string
}

export type HistoryPageProps = {
  labels: HistoryPageLabels
  plans: readonly HistoryPlan[]
  loadFailed: boolean
  onRetry: () => void | Promise<void>
  onSave: () => void | Promise<void>
  onRestore: (plan: HistoryPlan) => void
  onDelete: (id: string) => void | Promise<void>
  onBack: () => void
}

export function HistoryPage({
  labels,
  plans,
  loadFailed,
  onRetry,
  onSave,
  onRestore,
  onDelete,
  onBack,
}: HistoryPageProps) {
  const handleSave = async () => {
    try {
      await onSave()
    } catch (error) {
      console.error(error)
      alert(labels.saveFailed)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(labels.confirmDelete)) return
    try {
      await onDelete(id)
    } catch (error) {
      console.error(error)
      alert(labels.deleteFailed)
    }
  }

  return (
    <section className="archive-card overflow-hidden p-[18px]" data-testid="history-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{labels.title}</h2>
          <p className="text-sm text-[#64748b]">
            {loadFailed ? labels.loadFailed : labels.noHistory}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="archive-button success" type="button" onClick={() => void handleSave()}>
            {labels.savePlan}
          </button>
          <button className="archive-button secondary" type="button" onClick={onBack}>{labels.backToWorkbench}</button>
        </div>
      </div>
      {loadFailed ? (
        <div className="flex items-center justify-between gap-3 border border-red-300 bg-red-50 p-3 text-red-700" data-testid="history-load-error">
          <span>{labels.loadFailed}</span>
          <button className="archive-button secondary" type="button" onClick={() => void onRetry()}>
            {labels.retry}
          </button>
        </div>
      ) : plans.length === 0 ? (
        <p className="border border-[#c6c6c6] bg-white p-3" data-testid="history-empty-state">{labels.noHistory}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <article className="border border-[#c6c6c6] bg-white p-3 text-sm flex flex-col justify-between" key={plan.id}>
              <div>
                <strong>{plan.projectName}</strong>
                <p>{labels.shipmentName}: {plan.shipmentName || '-'}</p>
                <p>{new Date(plan.createdAt).toLocaleString()}</p>
                <p>{plan.placedCount}/{plan.totalCargoCount} · {plan.layerCount} {labels.layers}</p>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{plan.labelSummary}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="border border-[#9b9b9b] bg-[#eeeeee] px-3 py-1.5 text-xs font-semibold hover:bg-slate-200 transition" type="button" onClick={() => onRestore(plan)}>
                  {labels.restore}
                </button>
                <button className="border border-red-300 bg-red-50 text-red-700 px-3 py-1.5 text-xs font-semibold hover:bg-red-100 transition" type="button" onClick={() => void handleDelete(plan.id)}>
                  {labels.delete}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
