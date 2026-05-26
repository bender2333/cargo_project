import type { Locale } from '../types'
import type { CogResult } from '../lib/centerOfGravity'
import { COMFORT_RATIO, CRITICAL_RATIO } from '../lib/centerOfGravity'
import type { CogViewMode } from '../lib/cogView'
import type { VehicleProfileId } from '../data/vehicleProfiles'

const VEHICLE_LABELS: Record<VehicleProfileId, { en: string; zh: string }> = {
  'semi-trailer': { en: 'Semi-trailer', zh: '半挂' },
  'flatbed': { en: 'Flatbed', zh: '平板挂' },
  'box-truck': { en: 'Box truck', zh: '厢式货车' },
  'container-only': { en: 'Container only', zh: '仅货柜' },
}

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
    showIn3d: 'Show in 3D',
    hideIn3d: 'Hide 3D overlay',
    showGravityField: 'Gravity field',
    hideGravityField: 'Hide gravity field',
    gravityFieldTooltip: 'Heat-map of distance from the load center over the container floor.',
    viewMode: '3D view',
    packingView: 'Packing',
    cogView: 'CoG',
    mixedView: 'Mixed',
    boxOpacity: 'Box opacity',
    vehicle: 'Vehicle',
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
    showIn3d: '在 3D 中显示',
    hideIn3d: '关闭 3D 显示',
    showGravityField: '重心场',
    hideGravityField: '关闭重心场',
    gravityFieldTooltip: '在柜底投影出与装载重心的距离热点图。',
    viewMode: '3D 视图',
    packingView: '装箱',
    cogView: '重心',
    mixedView: '混合',
    boxOpacity: '箱体透明度',
    vehicle: '车型',
  },
} as const

type Props = {
  result: CogResult
  container: { length: number; width: number; height: number }
  locale: Locale
  show3d: boolean
  onToggle3d: (show: boolean) => void
  showGravityField: boolean
  onToggleGravityField: (show: boolean) => void
  cogViewMode: CogViewMode
  onCogViewModeChange: (mode: CogViewMode) => void
  mixedBoxOpacity: number
  onMixedBoxOpacityChange: (opacity: number) => void
  vehicleProfile: VehicleProfileId
  onVehicleProfileChange: (id: VehicleProfileId) => void
}

function formatMm(n: number) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${Math.round(n)} mm`
}

function ratio(value: number, dim: number) {
  if (dim <= 0) return 0
  return value / dim
}

export function CenterOfGravityPanel({
  result,
  container,
  locale,
  show3d,
  onToggle3d,
  showGravityField,
  onToggleGravityField,
  cogViewMode,
  onCogViewModeChange,
  mixedBoxOpacity,
  onMixedBoxOpacityChange,
  vehicleProfile,
  onVehicleProfileChange,
}: Props) {
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
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-[#475569]">
            <span>{t.vehicle}:</span>
            <select
              className="rounded border border-[#cbd5e1] bg-white px-1.5 py-0.5 text-xs"
              value={vehicleProfile}
              data-testid="cog-vehicle-select"
              onChange={(event) => onVehicleProfileChange(event.target.value as VehicleProfileId)}
            >
              {(Object.keys(VEHICLE_LABELS) as VehicleProfileId[]).map((id) => (
                <option key={id} value={id}>{VEHICLE_LABELS[id][locale]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${show3d ? 'border-[#0ea5e9] bg-[#e0f2fe] text-[#0369a1]' : 'border-[#cbd5e1] bg-white text-[#475569]'}`}
            data-testid="cog-toggle-3d"
            aria-pressed={show3d}
            onClick={() => onToggle3d(!show3d)}
          >
            {show3d ? t.hideIn3d : t.showIn3d}
          </button>
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${showGravityField ? 'border-[#f59e0b] bg-[#fef3c7] text-[#92400e]' : 'border-[#cbd5e1] bg-white text-[#475569]'} disabled:cursor-not-allowed disabled:opacity-60`}
            data-testid="cog-toggle-gravity-field"
            aria-pressed={showGravityField}
            disabled={!show3d}
            title={t.gravityFieldTooltip}
            onClick={() => onToggleGravityField(!showGravityField)}
          >
            {showGravityField ? t.hideGravityField : t.showGravityField}
          </button>
          <div className="flex items-center gap-1 rounded-full border border-[#cbd5e1] bg-white p-0.5 text-xs" data-testid="cog-view-mode">
            {([
              ['packing', t.packingView],
              ['cog', t.cogView],
              ['mixed', t.mixedView],
            ] as Array<[CogViewMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`rounded-full px-2 py-0.5 font-semibold ${cogViewMode === mode ? 'bg-[#1d4ed8] text-white' : 'text-[#475569]'}`}
                aria-pressed={cogViewMode === mode}
                data-testid={`cog-view-${mode}`}
                onClick={() => onCogViewModeChange(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          {cogViewMode === 'mixed' && (
            <label className="flex items-center gap-1 text-xs text-[#475569]">
              <span>{t.boxOpacity}</span>
              <input
                type="range"
                min="0.15"
                max="1"
                step="0.05"
                value={mixedBoxOpacity}
                data-testid="cog-box-opacity"
                onChange={(event) => onMixedBoxOpacityChange(Number(event.target.value))}
              />
            </label>
          )}
          <span className="text-xs text-[#475569]" data-testid="cog-total-weight">
            {t.totalWeight}: {result.totalWeight.toFixed(1)} kg
          </span>
        </div>
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
