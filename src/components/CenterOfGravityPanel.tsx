import type { Locale } from '../types'
import type { CogResult } from '../lib/centerOfGravity'
import { COMFORT_RATIO, CRITICAL_RATIO } from '../lib/centerOfGravity'

const T = {
  en: {
    title: 'Center of gravity',
    description: 'Weighted load center vs. the container interior center.',
    notAvailable: 'Add weight to placed cargo to see the load center analysis.',
    totalWeight: 'Total weight',
    cog: 'Load center',
    center: 'Container center',
    offset: 'Offset from center',
    axisLength: 'Along length',
    axisWidth: 'Across width',
    axisHeight: 'Vertical',
    balanced: 'Balanced load',
    warning: 'Transport risk: load is biased — rebalance heavy cargo',
    okWithinComfort: 'Within ±5% of center on every axis.',
    cautious: 'Within ±10% — keep an eye on it.',
  },
  zh: {
    title: '装载重心',
    description: '按重量加权的装载重心与货柜几何中心对比。',
    notAvailable: '请为已放置货物录入重量后再查看重心分析。',
    totalWeight: '总重量',
    cog: '装载重心',
    center: '柜内中心',
    offset: '与中心偏移',
    axisLength: '沿柜长',
    axisWidth: '沿柜宽',
    axisHeight: '垂直方向',
    balanced: '装载平衡',
    warning: '运输风险：重心明显偏置，建议重新平衡较重货物',
    okWithinComfort: '各轴偏移在 ±5% 以内。',
    cautious: '偏移在 ±10% 以内，请留意。',
  },
} as const

type Props = {
  result: CogResult
  container: { length: number; width: number; height: number }
  locale: Locale
}

function formatMm(n: number) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${Math.round(n)} mm`
}

function ratio(value: number, dim: number) {
  if (dim <= 0) return 0
  return value / dim
}

export function CenterOfGravityPanel({ result, container, locale }: Props) {
  const t = T[locale]
  const empty = result.totalWeight <= 0

  if (empty) {
    return (
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 text-sm text-[#64748b]" data-testid="cog-panel-empty">
        <h3 className="mb-2 text-base font-bold text-[#0f172a]">{t.title}</h3>
        <p>{t.notAvailable}</p>
      </div>
    )
  }

  const status = result.warning ? 'warning' : result.balanced ? 'balanced' : 'cautious'
  const statusLabel = status === 'warning' ? t.warning : status === 'balanced' ? t.balanced : t.cautious
  const tone =
    status === 'warning'
      ? 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]'
      : status === 'balanced'
        ? 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'
        : 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]'

  return (
    <div className="space-y-3 rounded-xl border border-[#e5e7eb] bg-white p-4" data-testid="cog-panel" data-cog-status={status}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-bold text-[#0f172a]">{t.title}</h3>
        <span className="text-xs text-[#475569]" data-testid="cog-total-weight">
          {t.totalWeight}: {result.totalWeight.toFixed(1)} kg
        </span>
      </div>
      <p className="text-xs text-[#64748b]">{t.description}</p>

      <div className={`rounded-xl border p-3 text-xs font-semibold ${tone}`} data-testid="cog-status">
        {statusLabel}
        {status === 'balanced' && <span className="block font-normal text-[#166534]">{t.okWithinComfort}</span>}
      </div>

      <div className="grid grid-cols-1 gap-2 text-xs text-[#475569] sm:grid-cols-3">
        <div className="rounded-lg border border-[#e5e7eb] p-2">
          <div className="text-[10px] uppercase tracking-wider text-[#94a3b8]">{t.cog}</div>
          <div className="font-mono">({Math.round(result.cog.x)}, {Math.round(result.cog.y)}, {Math.round(result.cog.z)}) mm</div>
        </div>
        <div className="rounded-lg border border-[#e5e7eb] p-2">
          <div className="text-[10px] uppercase tracking-wider text-[#94a3b8]">{t.center}</div>
          <div className="font-mono">({Math.round(result.center.x)}, {Math.round(result.center.y)}, {Math.round(result.center.z)}) mm</div>
        </div>
        <div className="rounded-lg border border-[#e5e7eb] p-2">
          <div className="text-[10px] uppercase tracking-wider text-[#94a3b8]">{t.offset}</div>
          <div className="font-mono">({formatMm(result.offset.x)}, {formatMm(result.offset.y)}, {formatMm(result.offset.z)})</div>
        </div>
      </div>

      <ul className="space-y-1 text-xs">
        {([
          { axis: 'length' as const, label: t.axisLength, value: result.offset.x, dim: container.length },
          { axis: 'width' as const, label: t.axisWidth, value: result.offset.y, dim: container.width },
          { axis: 'height' as const, label: t.axisHeight, value: result.offset.z, dim: container.height },
        ]).map((row) => {
          const r = Math.abs(ratio(row.value, row.dim))
          const danger = r > CRITICAL_RATIO
          const caution = !danger && r > COMFORT_RATIO
          return (
            <li
              key={row.axis}
              className={`flex items-center justify-between rounded border px-2 py-1 ${danger ? 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]' : caution ? 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]' : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]'}`}
              data-axis={row.axis}
              data-axis-warning={danger ? 'true' : caution ? 'caution' : 'false'}
            >
              <span className="font-semibold">{row.label}</span>
              <span className="font-mono">{formatMm(row.value)} ({(r * 100).toFixed(1)}%)</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
