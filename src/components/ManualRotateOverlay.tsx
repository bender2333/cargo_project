import { useEffect, useState } from 'react'
import type { Locale } from '../types'
import type { ManualPlacedBox, ManualRotationDirection } from '../lib/manualPlacement'
import type { PlacementSettings } from '../lib/placementSettings'
import type { SelectedBoxScreenRect } from './ContainerScene'

const T = {
  en: {
    title: 'Selected box',
    size: 'Size',
    position: 'Position (mm)',
    apply: 'Apply',
    centre: 'Centre',
    pinFront: 'Front',
    pinBack: 'Back',
    pinLeft: 'Left',
    pinRight: 'Right',
    grounded: 'Floor',
    orientation: 'Orientation',
    supportPolicy: 'Support',
    rotationLocked: 'Rotation locked',
    delete: 'Delete',
    precise: 'Fine tune',
    yawLeft: 'Yaw left',
    yawRight: 'Yaw right',
    pitchUp: 'Pitch up',
    pitchDown: 'Pitch down',
  },
  zh: {
    title: '已选中',
    size: '尺寸',
    position: '位置 (mm)',
    apply: '应用',
    centre: '居中',
    pinFront: '靠前',
    pinBack: '靠后',
    pinLeft: '靠左',
    pinRight: '靠右',
    grounded: '落地',
    orientation: '朝向',
    supportPolicy: '支撑',
    rotationLocked: '禁止旋转',
    delete: '删除',
    precise: '精调',
    yawLeft: '左转',
    yawRight: '右转',
    pitchUp: '上翻',
    pitchDown: '下翻',
  },
} as const

type Props = {
  selected: ManualPlacedBox
  container: { length: number; width: number; height: number }
  locale: Locale
  placementSettings?: PlacementSettings
  screenRect: SelectedBoxScreenRect
  onMove: (x: number, y: number, z: number) => void
  onRotate: (direction: ManualRotationDirection) => void
  onDelete: () => void
}

function displayAxis(axis: string | undefined, fallback: string) {
  return (axis ?? fallback).replace('H', 'T')
}

function RotationButton({
  label,
  testId,
  disabled,
  children,
  onClick,
}: {
  label: string
  testId: string
  disabled?: boolean
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-md border border-[#cbd5e1] bg-white text-sm font-black text-[#0f172a] shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function ManualRotateOverlay({
  selected,
  container,
  locale,
  placementSettings,
  screenRect,
  onMove,
  onRotate,
  onDelete,
}: Props) {
  const t = T[locale]
  const [preciseOpen, setPreciseOpen] = useState(false)
  const [draft, setDraft] = useState<{ x: string; y: string; z: string }>({ x: '0', y: '0', z: '0' })

  useEffect(() => {
    setDraft({
      x: String(Math.round(selected.x)),
      y: String(Math.round(selected.y)),
      z: String(Math.round(selected.z)),
    })
  }, [selected])

  const commit = () => {
    const x = Number(draft.x)
    const y = Number(draft.y)
    const z = Number(draft.z)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
    onMove(x, y, z)
  }

  const centre = () => onMove((container.length - selected.length) / 2, (container.width - selected.width) / 2, selected.z)
  const pinFront = () => onMove(0, selected.y, selected.z)
  const pinBack = () => onMove(container.length - selected.length, selected.y, selected.z)
  const pinLeft = () => onMove(selected.x, 0, selected.z)
  const pinRight = () => onMove(selected.x, container.width - selected.width, selected.z)
  const grounded = () => onMove(selected.x, selected.y, 0)
  const rotationDisabled = selected.canRotate === false

  return (
    <div
      className="pointer-events-auto absolute z-20 w-[min(330px,calc(100%-24px))] rounded-lg border border-[#94a3b8] bg-white/95 p-2 text-xs text-[#334155] shadow-2xl backdrop-blur"
      data-testid="manual-rotate-overlay"
      style={{
        left: `clamp(170px, ${screenRect.x}px, calc(100% - 170px))`,
        top: screenRect.y,
        transform: 'translate(-50%, calc(-100% - 14px))',
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-[#0f172a]">
            {t.title}: <span className="rounded bg-[#111827] px-1.5 py-0.5 text-[10px] text-white">{selected.label}</span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-[#64748b]">{t.size}: {selected.length}x{selected.width}x{selected.height}</div>
        </div>
        {rotationDisabled && <span className="shrink-0 rounded bg-[#fef3c7] px-2 py-1 text-[10px] font-bold text-[#92400e]">{t.rotationLocked}</span>}
      </div>

      <div
        className="mb-2 rounded-md border border-[#cbd5e1] bg-[#f8fafc] p-2"
        data-testid="manual-orientation-diagram"
        data-orientation={selected.orientationKey}
      >
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-[#64748b]">
          <span>{t.orientation}</span>
          <span className="font-mono font-bold text-[#0f172a]">{selected.orientationLabel ?? selected.orientationKey}</span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center font-mono text-[11px] font-bold">
          <span className="rounded bg-[#dbeafe] px-1 py-0.5 text-[#1d4ed8]">X:{displayAxis(selected.orientationAxes?.x, selected.orientationKey[0])}</span>
          <span className="rounded bg-[#dcfce7] px-1 py-0.5 text-[#166534]">Y:{displayAxis(selected.orientationAxes?.y, selected.orientationKey[1])}</span>
          <span className="rounded bg-[#fee2e2] px-1 py-0.5 text-[#991b1b]">Z:{displayAxis(selected.orientationAxes?.z, selected.orientationKey[2])}</span>
        </div>
        {placementSettings && (
          <p className="mt-1 text-[10px] text-[#64748b]">
            {t.supportPolicy}: {Math.round(placementSettings.supportPolicy.minSupportRatio * 100)}%
            {placementSettings.supportPolicy.allowPartialOverhang ? ' partial' : ''}
          </p>
        )}
      </div>

      <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2">
        <div className="flex flex-col items-center gap-1">
          <RotationButton label={t.yawLeft} testId="manual-rotate-yaw-left" disabled={rotationDisabled} onClick={() => onRotate('left')}>↶</RotationButton>
          <RotationButton label={t.pitchUp} testId="manual-rotate-pitch-up" disabled={rotationDisabled} onClick={() => onRotate('up')}>↑</RotationButton>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            className="rounded-md border border-[#cbd5e1] bg-white px-2 py-2 text-[11px] font-bold text-[#0f172a]"
            data-testid="manual-precise-toggle"
            aria-expanded={preciseOpen}
            onClick={() => setPreciseOpen((current) => !current)}
          >
            {t.precise}
          </button>
          <button
            type="button"
            className="rounded-md border border-[#fecaca] bg-[#fff7f7] px-2 py-2 text-[11px] font-bold text-[#991b1b]"
            data-testid="manual-rotate-delete"
            onClick={onDelete}
          >
            {t.delete}
          </button>
        </div>
        <div className="flex flex-col items-center gap-1">
          <RotationButton label={t.yawRight} testId="manual-rotate-yaw-right" disabled={rotationDisabled} onClick={() => onRotate('right')}>↷</RotationButton>
          <RotationButton label={t.pitchDown} testId="manual-rotate-pitch-down" disabled={rotationDisabled} onClick={() => onRotate('down')}>↓</RotationButton>
        </div>
      </div>

      {preciseOpen && (
        <div className="mt-2 border-t border-[#e2e8f0] pt-2" data-testid="manual-precise-fields">
          <div className="mb-2 text-[10px] font-bold uppercase text-[#64748b]">{t.position}</div>
          <div className="mb-2 grid grid-cols-3 gap-2">
            {(['x', 'y', 'z'] as const).map((axis) => (
              <label key={axis} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold uppercase text-[#64748b]">{axis.toUpperCase()}</span>
                <input
                  type="number"
                  className="rounded-md border border-[#cbd5e1] bg-white p-1 font-mono text-[11px]"
                  data-testid={`manual-precise-input-${axis}`}
                  value={draft[axis]}
                  onChange={(event) => setDraft((current) => ({ ...current, [axis]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      commit()
                    }
                  }}
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            <button type="button" className="rounded-md bg-[#059669] px-2 py-1.5 text-[11px] font-bold text-white" data-testid="manual-precise-apply" onClick={commit}>{t.apply}</button>
            <button type="button" className="rounded-md bg-[#e2e8f0] px-2 py-1.5 text-[11px] font-bold text-[#0f172a]" data-testid="manual-precise-centre" onClick={centre}>{t.centre}</button>
            <button type="button" className="rounded-md bg-[#e2e8f0] px-2 py-1.5 text-[11px] font-bold text-[#0f172a]" data-testid="manual-precise-grounded" onClick={grounded}>{t.grounded}</button>
            <button type="button" className="rounded-md bg-[#e2e8f0] px-2 py-1.5 text-[11px] font-bold text-[#0f172a]" data-testid="manual-precise-front" onClick={pinFront}>{t.pinFront}</button>
            <button type="button" className="rounded-md bg-[#e2e8f0] px-2 py-1.5 text-[11px] font-bold text-[#0f172a]" data-testid="manual-precise-back" onClick={pinBack}>{t.pinBack}</button>
            <button type="button" className="rounded-md bg-[#e2e8f0] px-2 py-1.5 text-[11px] font-bold text-[#0f172a]" data-testid="manual-precise-left" onClick={pinLeft}>{t.pinLeft}</button>
            <button type="button" className="rounded-md bg-[#e2e8f0] px-2 py-1.5 text-[11px] font-bold text-[#0f172a]" data-testid="manual-precise-right" onClick={pinRight}>{t.pinRight}</button>
          </div>
        </div>
      )}
    </div>
  )
}
