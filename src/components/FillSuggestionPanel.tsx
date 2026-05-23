import type { Locale } from '../types'
import type { FillSuggestion } from '../lib/fillSuggestion'

const T = {
  en: {
    title: 'Top up the container',
    description: 'Upper-bound count of each standard preset that still fits the residual volume and weight.',
    notReady: 'Run automatic packing first to see top-up suggestions.',
    column: { box: 'Standard box', size: 'Size (mm)', weight: 'Weight (kg)', remaining: 'Remaining capacity allows', volumeCap: 'by volume', weightCap: 'by weight', apply: '' },
    add: 'Add to cargo',
    addAll: 'Add every preset',
    none: 'No more boxes of any preset will fit.',
    warning: 'These are upper bounds; rerun the packer to confirm geometry.',
    perClickCap: 'Each click adds at most 50 of a preset to keep the packer responsive. Click again for more.',
  },
  zh: {
    title: '剩余空间补装',
    description: '基于体积与重量剩余量给出的「还能再装」上限（实际能否装下取决于摆放，请重新计算确认）。',
    notReady: '请先完成自动排布后再查看补装建议。',
    column: { box: '标准箱型', size: '尺寸 (mm)', weight: '单重 (kg)', remaining: '剩余容量可容纳', volumeCap: '按体积', weightCap: '按重量', apply: '' },
    add: '加入货物',
    addAll: '一键全部加入',
    none: '所有候选箱型都装不下了。',
    warning: '这是上限值；如需确认请重新计算。',
    perClickCap: '为避免一次性加入过多导致计算卡死，每次每个箱型最多加入 50 件。需要更多请反复点击。',
  },
} as const

type Props = {
  suggestions: FillSuggestion[]
  available: boolean
  locale: Locale
  onAdd: (presetId: string, count: number) => void
  onAddAll: (suggestions: FillSuggestion[]) => void
}

export function FillSuggestionPanel({ suggestions, available, locale, onAdd, onAddAll }: Props) {
  const t = T[locale]

  if (!available) {
    return (
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 text-sm text-[#64748b]" data-testid="fill-panel-empty">
        <h3 className="mb-2 text-base font-bold text-[#0f172a]">{t.title}</h3>
        <p>{t.notReady}</p>
      </div>
    )
  }

  const anyFits = suggestions.some((s) => s.maxCount > 0)

  return (
    <div className="space-y-3 rounded-xl border border-[#e5e7eb] bg-white p-4" data-testid="fill-panel">
      <h3 className="text-base font-bold text-[#0f172a]">{t.title}</h3>
      <p className="text-xs text-[#64748b]">{t.description}</p>

      {!anyFits ? (
        <p className="rounded border border-[#fde68a] bg-[#fffbeb] p-2 text-xs text-[#92400e]" data-testid="fill-none">{t.none}</p>
      ) : (
        <>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#e5e7eb] text-left text-[10px] uppercase tracking-wider text-[#64748b]">
                <th className="px-2 py-1">{t.column.box}</th>
                <th className="px-2 py-1">{t.column.size}</th>
                <th className="px-2 py-1">{t.column.weight}</th>
                <th className="px-2 py-1">{t.column.remaining}</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr
                  key={s.preset.id}
                  className="border-b border-[#f1f5f9]"
                  data-testid={`fill-row-${s.preset.id}`}
                  data-max-count={s.maxCount}
                >
                  <td className="px-2 py-1 font-semibold text-[#0f172a]">
                    <span className="mr-2 inline-block h-3 w-3 align-middle" style={{ backgroundColor: s.preset.color }} />
                    {s.preset.name}
                  </td>
                  <td className="px-2 py-1 font-mono">{s.preset.length} × {s.preset.width} × {s.preset.height}</td>
                  <td className="px-2 py-1 font-mono">{s.preset.weight}</td>
                  <td className="px-2 py-1 font-mono">
                    {s.maxCount}
                    <span className="ml-2 text-[10px] text-[#94a3b8]">
                      ({s.volumeCap} {t.column.volumeCap} / {s.weightCap} {t.column.weightCap})
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="archive-button"
                      data-testid={`fill-add-${s.preset.id}`}
                      disabled={s.maxCount === 0}
                      onClick={() => onAdd(s.preset.id, s.maxCount)}
                    >
                      {t.add}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[#94a3b8]">{t.warning}</p>
            <button
              type="button"
              className="archive-button success"
              data-testid="fill-add-all"
              onClick={() => onAddAll(suggestions)}
            >
              {t.addAll}
            </button>
          </div>
          <p className="rounded border border-[#bae6fd] bg-[#f0f9ff] p-2 text-[10px] text-[#0c4a6e]" data-testid="fill-cap-note">
            {t.perClickCap}
          </p>
        </>
      )}
    </div>
  )
}
