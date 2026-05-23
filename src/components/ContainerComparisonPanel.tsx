import type { Locale, ContainerSpec } from '../types'
import type { ContainerComparisonRow } from '../lib/containerCompare'

const T = {
  en: {
    title: 'Compare containers',
    description: 'Run the same cargo against several containers side by side.',
    chooseHint: 'Pick 2-3 containers to compare with the current cargo list.',
    container: 'Container',
    loaded: 'Loaded',
    unplaced: 'Unplaced',
    volumeUtil: 'Volume',
    weightUtil: 'Weight',
    fitFull: 'Full fit',
    fitPartial: 'Partial fit',
    fitNone: 'No fit',
    recommended: 'Best fit',
    pickAtLeastOne: 'Select at least one container to compare.',
    cargoEmpty: 'Add cargo before comparing containers.',
    apply: 'Apply selection',
    selected: 'Selected',
  },
  zh: {
    title: '柜型对比',
    description: '同一批货物一次性比较多个柜型的装载情况。',
    chooseHint: '勾选 2-3 个柜型与当前货物清单对比。',
    container: '柜型',
    loaded: '已装',
    unplaced: '未装',
    volumeUtil: '体积利用率',
    weightUtil: '重量利用率',
    fitFull: '全部装下',
    fitPartial: '部分装下',
    fitNone: '装不下',
    recommended: '最优',
    pickAtLeastOne: '请至少勾选一个柜型进行对比。',
    cargoEmpty: '请先录入货物再进行对比。',
    apply: '应用最优柜型',
    selected: '已选',
  },
} as const

type Props = {
  candidates: ContainerSpec[]
  selectedIds: string[]
  rows: ContainerComparisonRow[]
  hasCargo: boolean
  locale: Locale
  onToggleCandidate: (containerId: string) => void
  onApplyRecommended: (containerId: string) => void
}

function fitLabel(fit: ContainerComparisonRow['fit'], locale: Locale) {
  const t = T[locale]
  if (fit === 'full') return t.fitFull
  if (fit === 'partial') return t.fitPartial
  return t.fitNone
}

function fitTone(fit: ContainerComparisonRow['fit']) {
  if (fit === 'full') return 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
  if (fit === 'partial') return 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]'
  return 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]'
}

function pickRecommendation(rows: ContainerComparisonRow[]): string | null {
  // Prefer the container that fits all cargo with the smallest volume; if no
  // full-fit exists, the one with the most placed boxes; tie-break on volume.
  const fulls = rows.filter((r) => r.fit === 'full')
  if (fulls.length > 0) {
    const sorted = [...fulls].sort((a, b) => a.containerVolume - b.containerVolume)
    return sorted[0].container.id
  }
  const sorted = [...rows].sort((a, b) => {
    if (b.placedCount !== a.placedCount) return b.placedCount - a.placedCount
    return a.containerVolume - b.containerVolume
  })
  return sorted[0]?.container.id ?? null
}

export function ContainerComparisonPanel({
  candidates,
  selectedIds,
  rows,
  hasCargo,
  locale,
  onToggleCandidate,
  onApplyRecommended,
}: Props) {
  const t = T[locale]
  const recommendedId = rows.length > 0 ? pickRecommendation(rows) : null

  return (
    <div className="space-y-3 rounded-xl border border-[#e5e7eb] bg-white p-4" data-testid="container-compare-panel">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-[#0f172a]">{t.title}</h3>
        <span className="text-xs text-[#475569]">{t.selected}: {selectedIds.length}</span>
      </div>
      <p className="text-xs text-[#64748b]">{t.description}</p>

      <fieldset className="flex flex-wrap gap-2" data-testid="container-compare-candidates">
        {candidates.map((container) => {
          const checked = selectedIds.includes(container.id)
          return (
            <label
              key={container.id}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${checked ? 'border-[#0ea5e9] bg-[#e0f2fe] text-[#0369a1]' : 'border-[#cbd5e1] bg-white text-[#475569]'}`}
              data-checked={checked}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleCandidate(container.id)}
                data-testid={`container-compare-toggle-${container.id}`}
              />
              <span className="font-semibold">{container.label}</span>
              <span className="text-[10px] text-[#64748b]">{container.length} × {container.width} × {container.height}</span>
            </label>
          )
        })}
      </fieldset>

      {!hasCargo ? (
        <p className="rounded border border-[#fde68a] bg-[#fffbeb] p-2 text-xs text-[#92400e]">{t.cargoEmpty}</p>
      ) : selectedIds.length === 0 ? (
        <p className="rounded border border-[#cbd5e1] bg-[#f8fafc] p-2 text-xs text-[#475569]">{t.pickAtLeastOne}</p>
      ) : (
        <div className="overflow-x-auto" data-testid="container-compare-results">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#e5e7eb] text-left text-[10px] uppercase tracking-wider text-[#64748b]">
                <th className="px-2 py-1">{t.container}</th>
                <th className="px-2 py-1">{t.loaded}</th>
                <th className="px-2 py-1">{t.unplaced}</th>
                <th className="px-2 py-1">{t.volumeUtil}</th>
                <th className="px-2 py-1">{t.weightUtil}</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isRecommended = row.container.id === recommendedId
                return (
                  <tr
                    key={row.container.id}
                    className={`border-b border-[#f1f5f9] ${isRecommended ? 'bg-[#f0fdf4]' : ''}`}
                    data-testid={`container-compare-row-${row.container.id}`}
                    data-recommended={isRecommended ? 'true' : 'false'}
                    data-fit={row.fit}
                  >
                    <td className="px-2 py-1 font-semibold text-[#0f172a]">
                      {row.container.label}
                      {isRecommended && (
                        <span className="ml-2 rounded-full bg-[#16a34a] px-2 py-0.5 text-[10px] font-bold text-white">{t.recommended}</span>
                      )}
                    </td>
                    <td className="px-2 py-1">{row.placedCount} / {row.totalCargoCount}</td>
                    <td className="px-2 py-1">{row.unplacedCount}</td>
                    <td className="px-2 py-1 font-mono">{row.volumeUtilization.toFixed(1)}%</td>
                    <td className="px-2 py-1 font-mono">{row.weightUtilization.toFixed(1)}%</td>
                    <td className="px-2 py-1">
                      <span className={`rounded border px-2 py-0.5 ${fitTone(row.fit)}`}>{fitLabel(row.fit, locale)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {recommendedId && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="archive-button success"
                data-testid="container-compare-apply"
                onClick={() => onApplyRecommended(recommendedId)}
              >
                {t.apply}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
