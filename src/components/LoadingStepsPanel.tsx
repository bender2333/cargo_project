import type { Locale } from '../types'
import type { LoadingTaskGroup } from '../lib/loadingTaskGroups'

const T = {
  en: {
    title: 'Loading Steps',
    description: 'Review the stage-merged loading plan for field execution.',
    unavailable: 'Loading steps are available after a calculated automatic plan.',
    stage: 'Stage',
    of: 'of',
    prev: 'Previous',
    next: 'Next',
    play: 'Play',
    pause: 'Pause',
    layer: 'Layer',
    steps: 'Steps',
    boxes: 'Boxes',
    labels: 'Labels',
    depth: 'Depth',
    width: 'Width',
    height: 'Height',
    support: 'Support',
    floor: 'floor',
    fullySupported: 'fully supported',
    partiallySupported: 'partial support',
    supportedBy: 'Supported by',
    exportPdf: 'Export loading sheet PDF',
  },
  zh: {
    title: '装柜步骤',
    description: '按阶段合并后的现场装柜说明进行复核。',
    unavailable: '自动排布计算完成后才能查看装柜步骤。',
    stage: '阶段',
    of: '/',
    prev: '上一阶段',
    next: '下一阶段',
    play: '播放',
    pause: '暂停',
    layer: '层级',
    steps: '步骤',
    boxes: '箱体',
    labels: '标签',
    depth: '深度',
    width: '宽度',
    height: '高度',
    support: '支撑',
    floor: '地面',
    fullySupported: '完全支撑',
    partiallySupported: '部分支撑',
    supportedBy: '支撑来源',
    exportPdf: '导出作业分解图 PDF',
  },
} as const

type Props = {
  groups: LoadingTaskGroup[]
  activeIndex: number
  playing: boolean
  locale: Locale
  available: boolean
  exportDisabled?: boolean
  onSelectGroup: (index: number) => void
  onTogglePlay: () => void
  onExportPdf?: () => void
}

function rangeLabel(start: number, end: number) {
  return start === end ? String(start) : `${start}-${end}`
}

function formatMm(value: number) {
  return Math.round(value).toLocaleString()
}

function supportLabel(type: LoadingTaskGroup['supportTypes'][number], locale: Locale) {
  const t = T[locale]
  if (type === 'floor') return t.floor
  if (type === 'fully-supported') return t.fullySupported
  return t.partiallySupported
}

export function LoadingStepsPanel({ groups, activeIndex, playing, locale, available, exportDisabled = false, onSelectGroup, onTogglePlay, onExportPdf }: Props) {
  const t = T[locale]

  if (!available || groups.length === 0) {
    return (
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 text-sm text-[#64748b]" data-testid="loading-steps-empty">
        <h3 className="mb-2 text-base font-bold text-[#0f172a]">{t.title}</h3>
        <p>{t.unavailable}</p>
      </div>
    )
  }

  const activeGroup = groups[Math.max(0, Math.min(activeIndex, groups.length - 1))]

  return (
    <div
      className="space-y-3 rounded-xl border border-[#e5e7eb] bg-white p-4"
      data-testid="loading-steps-panel"
      data-active-group={activeGroup.sequence}
      data-active-box-count={activeGroup.boxIds.length}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-[#0f172a]">{t.title}</h3>
        <span className="text-xs text-[#475569]" data-testid="loading-steps-counter">
          {t.stage} {activeGroup.sequence} {t.of} {groups.length}
        </span>
      </div>
      <p className="text-xs text-[#64748b]">{t.description}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button className="archive-button" type="button" data-testid="loading-steps-prev" onClick={() => onSelectGroup(activeIndex - 1)} disabled={activeIndex <= 0}>
          {t.prev}
        </button>
        <button className="archive-button success" type="button" data-testid="loading-steps-toggle" onClick={onTogglePlay}>
          {playing ? t.pause : t.play}
        </button>
        <button className="archive-button" type="button" data-testid="loading-steps-next" onClick={() => onSelectGroup(activeIndex + 1)} disabled={activeIndex >= groups.length - 1}>
          {t.next}
        </button>
        {onExportPdf && (
          <button
            className="archive-button success ml-auto"
            type="button"
            data-testid="export-loading-sheet-pdf"
            disabled={exportDisabled}
            onClick={onExportPdf}
          >
            {t.exportPdf}
          </button>
        )}
      </div>

      <div className="rounded-lg border border-[#bae6fd] bg-[#f0f9ff] p-3 text-xs text-[#0c4a6e]" data-testid="loading-steps-current">
        <div className="font-semibold">
          {t.stage} {activeGroup.sequence}: {activeGroup.summary}
        </div>
        <div>{t.steps}: {rangeLabel(activeGroup.stepStart, activeGroup.stepEnd)} · {t.boxes}: {activeGroup.boxIds.length}</div>
        <div>{t.layer}: {activeGroup.physicalLayer} · {t.support}: {activeGroup.supportTypes.map((type) => supportLabel(type, locale)).join(', ')}</div>
        <div>{t.depth}: {formatMm(activeGroup.bounds.xMin)}-{formatMm(activeGroup.bounds.xMax)} mm · {t.width}: {formatMm(activeGroup.bounds.yMin)}-{formatMm(activeGroup.bounds.yMax)} mm · {t.height}: {formatMm(activeGroup.bounds.zMin)}-{formatMm(activeGroup.bounds.zMax)} mm</div>
        {activeGroup.supportedBy.length > 0 && <div>{t.supportedBy}: {activeGroup.supportedBy.join(', ')}</div>}
        <div className="mt-2 flex flex-wrap gap-1" data-testid="loading-steps-labels">
          {activeGroup.labels.map((entry) => (
            <span key={entry.label} className="inline-flex items-center gap-1 rounded border border-[#cbd5e1] bg-white px-2 py-0.5 font-semibold">
              <span className="h-2.5 w-2.5" style={{ backgroundColor: entry.color }} />
              {entry.label} x{entry.count}
            </span>
          ))}
        </div>
      </div>

      <ol className="max-h-56 space-y-1 overflow-auto text-xs text-[#475569]" data-testid="loading-steps-list">
        {groups.map((group, index) => (
          <li key={group.id}>
            <button
              className={`w-full rounded border px-2 py-1 text-left ${index === activeIndex ? 'border-[#f3b21a] bg-[#fff7dc] font-bold text-[#0f172a]' : 'border-[#cbd5e1] bg-white'}`}
              type="button"
              data-testid="loading-step-group"
              data-group-sequence={group.sequence}
              onClick={() => onSelectGroup(index)}
            >
              {t.stage} {group.sequence} · {t.steps} {rangeLabel(group.stepStart, group.stepEnd)} · {group.summary}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
